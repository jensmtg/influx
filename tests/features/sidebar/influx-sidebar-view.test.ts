import { InfluxSidebarView } from '@/features/sidebar/influx-sidebar-view';
import { mockTFile } from '../../mocks';
import InfluxFile from '@/domain/backlinks/influx-file';
import { createRoot } from 'react-dom/client';
import { influxUpdates$ } from '@/platform/events/influx-updates';
import type { InfluxSidebarPlugin } from '@/features/sidebar/influx-sidebar-plugin';
import type { TFile, WorkspaceLeaf } from 'obsidian';

jest.mock('react-dom/client', () => ({
	createRoot: jest.fn(() => ({
		render: jest.fn(),
		unmount: jest.fn(),
	})),
}));

jest.mock('@/domain/backlinks/influx-file', () => ({
	__esModule: true,
	default: {
		create: jest.fn(),
	},
}));

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('InfluxSidebarView', () => {
	type MockRoot = { render: jest.Mock; unmount: jest.Mock };
	type TestableSidebarView = {
		app: InfluxSidebarPlugin['app'];
		containerEl: { id: string };
		registerEvent: jest.Mock;
		root: MockRoot | null;
		currentFile: TFile | null;
		influxFile: unknown;
		abortController: { abort?: jest.Mock; signal: { aborted: boolean } } | null;
		currentUpdateId: number;
		plugin: InfluxSidebarPlugin;
		leaf: WorkspaceLeaf | { id: string };
		updatesUnsubscribe: (() => void) | null;
		handleEditorChange: () => Promise<void>;
		registerFileEvents: () => void;
	};

	const createInfluxFileMock = (InfluxFile as { create: jest.Mock }).create;

	function getViewHarness(view: InfluxSidebarView): TestableSidebarView {
		return view as unknown as TestableSidebarView;
	}

	const getRenderedText = (node: any): string => {
		if (node == null || typeof node === 'boolean') {
			return '';
		}
		if (typeof node === 'string' || typeof node === 'number') {
			return String(node);
		}
		if (Array.isArray(node)) {
			return node.map((child) => getRenderedText(child)).join(' ');
		}
		return getRenderedText(node.props?.children);
	};

	const createContext = () => {
		const fileA = mockTFile('A.md', 'A');
		const fileB = mockTFile('B.md', 'B');
		const workspaceOn = jest.fn().mockReturnValue(() => {});

		const plugin: InfluxSidebarPlugin = {
			data: {
				settings: {
					liveUpdate: true,
				},
			},
			api: {
				getShowStatus: jest.fn().mockReturnValue(true),
				invalidateFileCache: jest.fn(),
			},
			cycleListLimit: jest.fn(),
			toggleSortOrder: jest.fn(),
			toggleFrontmatterLinks: jest.fn(),
			app: {
				workspace: {
					on: workspaceOn,
					getActiveFile: jest.fn().mockReturnValue(null),
				},
			},
		} as unknown as InfluxSidebarPlugin;

		const leaf = {} as WorkspaceLeaf;
		const view = new InfluxSidebarView(leaf, plugin);
		const harness = getViewHarness(view);
		harness.app = plugin.app;
		harness.containerEl = { id: 'sidebar-root' };
		harness.registerEvent = jest.fn();
		harness.root = {
			render: jest.fn(),
			unmount: jest.fn(),
		};

		return {
			view,
			harness,
			plugin,
			fileA,
			fileB,
			workspaceOn,
		};
	};

	beforeEach(() => {
		jest.clearAllMocks();
		influxUpdates$.unsubscribeAll();
	});

	test('updateView short-circuits when file is unchanged', async () => {
		const { view, harness, fileA } = createContext();
		harness.currentFile = fileA;

		await view.updateView(fileA);

		expect(createInfluxFileMock).not.toHaveBeenCalled();
	});

	test('updateView cancels previous request and renders empty status when file should not show', async () => {
		const { view, harness, fileA, fileB } = createContext();
		const abort = jest.fn();
		harness.abortController = { abort, signal: { aborted: false } };

		createInfluxFileMock.mockResolvedValue({
			show: false,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		});

		await view.updateView(fileA);

		expect(abort).toHaveBeenCalledTimes(1);
		expect(harness.currentFile).toBe(fileA);
		const renderCalls = (harness.root?.render as jest.Mock).mock.calls;
		const lastRendered = renderCalls[renderCalls.length - 1][0];
		expect(getRenderedText(lastRendered)).toContain('Nothing to show for this note yet');

		await view.updateView(fileB);
		expect(createInfluxFileMock).toHaveBeenCalledWith('B.md', harness.plugin.api);
	});

	test('handleEditorChange renders hidden-state message when current file should be hidden', async () => {
		const { harness, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockReturnValue(false);
		harness.currentFile = fileA;
		harness.influxFile = {
			show: true,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};

		await harness.handleEditorChange();

		expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
		const renderCalls = (harness.root?.render as jest.Mock).mock.calls;
		const lastRendered = renderCalls[renderCalls.length - 1][0];
		expect(getRenderedText(lastRendered)).toContain('Linked mentions are hidden for this note');
	});

	test('updateView ignores stale results from an older async update', async () => {
		const { view, harness, fileA, fileB } = createContext();
		let resolveA: ((value: unknown) => void) | null = null;

		const influxA = {
			show: true,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([{ sourcePath: 'A.md' }]),
			totalEntryCount: 1,
		};
		const influxB = {
			show: true,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([{ sourcePath: 'B.md' }]),
			totalEntryCount: 1,
		};

		createInfluxFileMock.mockImplementation((path: string) => {
			if (path === 'A.md') {
				return new Promise((resolve) => {
					resolveA = resolve;
				});
			}
			return Promise.resolve(influxB);
		});

		const first = view.updateView(fileA);
		await Promise.resolve();
		const second = view.updateView(fileB);
		await second;

		resolveA?.(influxA);
		await first;

		expect(harness.currentFile).toBe(fileB);
		const renderCalls = (harness.root?.render as jest.Mock).mock.calls;
		const lastRenderArg = renderCalls[renderCalls.length - 1][0];
		expect(lastRenderArg.props.influxFile).toBe(influxB);
	});

	test('updateView renders loading state while awaiting influx file creation', async () => {
		const { view, harness, fileA } = createContext();
		let resolveCreate: ((value: unknown) => void) | null = null;

		createInfluxFileMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveCreate = resolve;
				})
		);

		const pending = view.updateView(fileA);
		const renderCalls = (harness.root?.render as jest.Mock).mock.calls;
		expect(renderCalls).toHaveLength(1);
		expect(getRenderedText(renderCalls[0][0])).toContain('Loading linked mentions');
		expect(getRenderedText(renderCalls[0][0])).toContain('Scanning backlinks for A.');

		resolveCreate?.({
			show: false,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		});
		await pending;
	});

	test('handleEditorChange drops rendering when update id changes mid-flight', async () => {
		const { harness, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockReturnValue(true);

		let release: (() => void) | null = null;
		const influxFile = {
			show: true,
			makeInfluxList: jest.fn().mockImplementation(
				() =>
					new Promise<void>((resolve) => {
						release = resolve;
					})
			),
			toEntries: jest.fn().mockReturnValue([{ sourcePath: 'A.md' }]),
			totalEntryCount: 1,
		};

		harness.currentFile = fileA;
		harness.influxFile = influxFile;
		harness.abortController = { signal: { aborted: false } };
		harness.currentUpdateId = 10;

		const pending = harness.handleEditorChange();
		harness.currentUpdateId = 11;
		release?.();
		await pending;

		expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('A.md');
		expect(harness.root?.render).not.toHaveBeenCalled();
	});

	test('handleEditorChange does not render hidden state when request becomes stale', async () => {
		const { harness, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockImplementation(() => {
			harness.currentUpdateId = 2;
			return false;
		});

		harness.currentFile = fileA;
		harness.influxFile = {
			show: true,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};
		harness.abortController = { signal: { aborted: false } };
		harness.currentUpdateId = 1;

		await harness.handleEditorChange();

		expect(harness.root?.render).not.toHaveBeenCalled();
		expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
	});

	test('handleEditorChange suppresses stale error banner when update id changes', async () => {
		const { harness, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockReturnValue(true);

		harness.currentFile = fileA;
		harness.influxFile = {
			show: true,
			makeInfluxList: jest.fn().mockRejectedValue(new Error('boom')),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};
		harness.abortController = { signal: { aborted: false } };
		harness.currentUpdateId = 4;

		const pending = harness.handleEditorChange();
		harness.currentUpdateId = 5;
		await pending;

		expect(harness.root?.render).not.toHaveBeenCalled();
	});

	test('onOpen creates a root, registers file events, and updates for the active file', async () => {
		const { view, harness, plugin, fileA } = createContext();
		const createdRoot = {
			render: jest.fn(),
			unmount: jest.fn(),
		};
		const registerFileEventsSpy = jest.spyOn(harness, 'registerFileEvents').mockImplementation(() => {});
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		(plugin.app.workspace.getActiveFile as jest.Mock).mockReturnValue(fileA);
		(createRoot as jest.Mock).mockReturnValue(createdRoot);

		await view.onOpen();

		expect(createRoot).toHaveBeenCalledWith(harness.containerEl);
		expect(registerFileEventsSpy).toHaveBeenCalledTimes(1);
		expect(influxUpdates$.observerCount).toBe(1);
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);
		expect(harness.root).toBe(createdRoot);
	});

	test('onOpen still registers events when there is no active file', async () => {
		const { view, harness, plugin } = createContext();
		const createdRoot = {
			render: jest.fn(),
			unmount: jest.fn(),
		};
		const registerFileEventsSpy = jest.spyOn(harness, 'registerFileEvents').mockImplementation(() => {});
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		(plugin.app.workspace.getActiveFile as jest.Mock).mockReturnValue(null);
		(createRoot as jest.Mock).mockReturnValue(createdRoot);

		await view.onOpen();

		expect(registerFileEventsSpy).toHaveBeenCalledTimes(1);
		expect(updateViewSpy).not.toHaveBeenCalled();
		const renderCalls = (harness.root?.render as jest.Mock).mock.calls;
		const lastRendered = renderCalls[renderCalls.length - 1][0];
		expect(getRenderedText(lastRendered)).toContain('Open a note to explore linked mentions');
	});

	test('onClose aborts pending work, unmounts root, and clears sidebar state', async () => {
		const { view, harness, fileA } = createContext();
		const abort = jest.fn();
		const unmount = jest.fn();
		const updatesUnsubscribe = jest.fn();

		harness.updatesUnsubscribe = updatesUnsubscribe;
		harness.abortController = { abort };
		harness.root = { render: jest.fn(), unmount };
		harness.currentFile = fileA;
		harness.influxFile = { show: true };

		await view.onClose();

		expect(abort).toHaveBeenCalledTimes(1);
		expect(unmount).toHaveBeenCalledTimes(1);
		expect(updatesUnsubscribe).toHaveBeenCalledTimes(1);
		expect(harness.abortController).toBeNull();
		expect(harness.root).toBeNull();
		expect(harness.currentFile).toBeNull();
		expect(harness.influxFile).toBeNull();
	});

	test('shared update bus refreshes the current sidebar file for relevant global updates', async () => {
		const { view, harness, fileA } = createContext();
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);

		await view.onOpen();
		harness.currentFile = fileA;
		harness.influxFile = {
			shouldUpdate: jest.fn().mockReturnValue(false),
		};

		await influxUpdates$.notify({ op: 'save-settings' });

		expect(updateViewSpy).toHaveBeenCalledWith(fileA, { force: true });
	});

	test('shared update bus refreshes when a source-note change affects current backlinks', async () => {
		const { view, harness, fileA, fileB } = createContext();
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);

		await view.onOpen();
		harness.currentFile = fileA;
		harness.influxFile = {
			shouldUpdate: jest.fn().mockReturnValue(true),
		};

		await influxUpdates$.notify({ op: 'rename', file: fileB });

		expect(updateViewSpy).toHaveBeenCalledWith(fileA, { force: true });
	});

	test('shared update bus ignores irrelevant file updates', async () => {
		const { view, harness, fileA, fileB } = createContext();
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);

		await view.onOpen();
		harness.currentFile = fileA;
		harness.influxFile = {
			shouldUpdate: jest.fn().mockReturnValue(false),
		};

		await influxUpdates$.notify({ op: 'modify', file: fileB });

		expect(updateViewSpy).not.toHaveBeenCalledWith(fileA, { force: true });
	});

	test('shared update bus refreshes on delete even when shouldUpdate no longer reports the removed source', async () => {
		const { view, harness, fileA, fileB } = createContext();
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);

		await view.onOpen();
		harness.currentFile = fileA;
		harness.influxFile = {
			shouldUpdate: jest.fn().mockReturnValue(false),
		};

		await influxUpdates$.notify({ op: 'delete', file: fileB });

		expect(updateViewSpy).toHaveBeenCalledWith(fileA, { force: true });
	});

	test('registerFileEvents wires active leaf, file open, and editor change listeners', () => {
		const { view, harness, plugin, fileA, workspaceOn } = createContext();
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		const handleEditorChangeSpy = jest.spyOn(harness, 'handleEditorChange').mockResolvedValue(undefined);

		harness.registerFileEvents();

		expect(workspaceOn).toHaveBeenCalledTimes(3);
		expect(harness.registerEvent).toHaveBeenCalledTimes(3);

		const activeLeafHandler = workspaceOn.mock.calls[0][1];
		activeLeafHandler({ view: { file: fileA } });
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);

		const fileOpenHandler = workspaceOn.mock.calls[1][1];
		fileOpenHandler(fileA);
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);

		harness.currentFile = fileA;
		(plugin.data.settings.liveUpdate as boolean) = true;
		const editorChangeHandler = workspaceOn.mock.calls[2][1];
		editorChangeHandler({}, { file: fileA });
		expect(handleEditorChangeSpy).toHaveBeenCalledTimes(1);
	});

	test('registerFileEvents clears the sidebar to an idle state when no file is open', () => {
		const { harness, workspaceOn, fileA } = createContext();
		harness.currentFile = fileA;
		harness.influxFile = { show: true };

		harness.registerFileEvents();

		const fileOpenHandler = workspaceOn.mock.calls[1][1];
		fileOpenHandler(null);

		expect(harness.currentFile).toBeNull();
		expect(harness.influxFile).toBeNull();
		const renderCalls = (harness.root?.render as jest.Mock).mock.calls;
		const lastRendered = renderCalls[renderCalls.length - 1][0];
		expect(getRenderedText(lastRendered)).toContain('Open a note to explore linked mentions');
	});

	test('registerFileEvents keeps sidebar content mounted when the sidebar leaf becomes active', () => {
		const { harness, workspaceOn, fileA } = createContext();
		harness.currentFile = fileA;
		harness.influxFile = { show: true };
		harness.leaf = { id: 'sidebar-leaf' };

		harness.registerFileEvents();

		const activeLeafHandler = workspaceOn.mock.calls[0][1];
		activeLeafHandler(harness.leaf);

		expect(harness.currentFile).toBe(fileA);
		expect(harness.influxFile).toEqual({ show: true });
		expect(harness.root?.render).not.toHaveBeenCalled();
	});

	test('registerFileEvents ignores editor changes when live update is disabled', () => {
		const { harness, plugin, fileA, workspaceOn } = createContext();
		const handleEditorChangeSpy = jest.spyOn(harness, 'handleEditorChange').mockResolvedValue(undefined);

		harness.registerFileEvents();
		harness.currentFile = fileA;
		(plugin.data.settings.liveUpdate as boolean) = false;

		const editorChangeHandler = workspaceOn.mock.calls[2][1];
		editorChangeHandler({}, { file: fileA });

		expect(handleEditorChangeSpy).not.toHaveBeenCalled();
	});

	test('handleEditorChange warning banner keeps structured title and retry detail', async () => {
		const { harness, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockReturnValue(true);

		harness.currentFile = fileA;
		harness.influxFile = {
			show: true,
			makeInfluxList: jest.fn().mockRejectedValue(new Error('boom')),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};
		harness.abortController = { signal: { aborted: false } };
		harness.currentUpdateId = 4;

		await harness.handleEditorChange();

		const renderCalls = (harness.root?.render as jest.Mock).mock.calls;
		const lastRendered = renderCalls[renderCalls.length - 1][0];
		expect(getRenderedText(lastRendered)).toContain('Sidebar refresh failed');
		expect(getRenderedText(lastRendered)).toContain('Keep editing and Influx will retry');
	});
});

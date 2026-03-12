import { InfluxSidebarView } from '@/features/sidebar/influx-sidebar-view';
import { mockTFile } from '../../mocks';
import InfluxFile from '@/domain/backlinks/influx-file';
import { createRoot } from 'react-dom/client';
import { influxUpdates$ } from '@/platform/events/influx-updates';
import type { InfluxSidebarPlugin } from '@/features/sidebar/influx-sidebar-plugin';
import { MarkdownView, type TFile, type WorkspaceLeaf } from 'obsidian';

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
		const createMarkdownView = (file: TFile | null) => {
			const view = new MarkdownView({} as any) as MarkdownView & { mode: 'source' | 'preview' };
			view.mode = 'source';
			view.file = file as any;
			return view;
		};
		const workspaceHandlers = new Map<string, (...args: unknown[]) => void>();
		const workspaceOn = jest.fn().mockImplementation((eventName: string, handler: (...args: unknown[]) => void) => {
			workspaceHandlers.set(eventName, handler);
			return () => {};
		});

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
					getActiveViewOfType: jest.fn().mockReturnValue(null),
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
			createMarkdownView,
			emitWorkspaceEvent: (eventName: string, ...args: unknown[]) => {
				const handler = workspaceHandlers.get(eventName);
				if (!handler) {
					throw new Error(`Missing workspace handler for ${eventName}`);
				}
				handler(...args);
			},
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

	test('updateView cancels previous request and can continue with a later file after a hidden result', async () => {
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

		await view.updateView(fileB);
		expect(createInfluxFileMock).toHaveBeenCalledWith('B.md', harness.plugin.api);
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
		const renderCountBeforeStaleResolve = (harness.root?.render as jest.Mock).mock.calls.length;

		if (resolveA) {
			(resolveA as (value: unknown) => void)(influxA);
		}
		await first;

		expect(harness.currentFile).toBe(fileB);
		expect((harness.root?.render as jest.Mock).mock.calls).toHaveLength(renderCountBeforeStaleResolve);
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
		if (release) {
			(release as () => void)();
		}
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

	test('onOpen creates a root, registers file events, and updates for the active markdown view file', async () => {
		const { view, harness, plugin, fileA, createMarkdownView } = createContext();
		const createdRoot = {
			render: jest.fn(),
			unmount: jest.fn(),
		};
		const registerFileEventsSpy = jest.spyOn(harness, 'registerFileEvents').mockImplementation(() => {});
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		(plugin.app.workspace.getActiveViewOfType as jest.Mock).mockReturnValue(createMarkdownView(fileA));
		(createRoot as jest.Mock).mockReturnValue(createdRoot);

		await view.onOpen();

		expect(createRoot).toHaveBeenCalledWith(harness.containerEl);
		expect(registerFileEventsSpy).toHaveBeenCalledTimes(1);
		expect(influxUpdates$.observerCount).toBe(1);
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);
		expect(harness.root).toBe(createdRoot);
	});


	test('onClose aborts pending work, unmounts root, and clears sidebar state', async () => {
		const { view, harness, fileA } = createContext();
		const abort = jest.fn();
		const unmount = jest.fn();
		const updatesUnsubscribe = jest.fn();

		harness.updatesUnsubscribe = updatesUnsubscribe;
		harness.abortController = { abort, signal: { aborted: false } };
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
		const { view, harness, plugin, fileA, workspaceOn, emitWorkspaceEvent, createMarkdownView } = createContext();
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		const handleEditorChangeSpy = jest.spyOn(harness, 'handleEditorChange').mockResolvedValue(undefined);

		harness.registerFileEvents();

		expect(workspaceOn).toHaveBeenCalledTimes(3);
		expect(harness.registerEvent).toHaveBeenCalledTimes(3);
		expect(workspaceOn.mock.calls.map((call) => call[0])).toEqual([
			'active-leaf-change',
			'file-open',
			'editor-change',
		]);

		emitWorkspaceEvent('active-leaf-change', { view: createMarkdownView(fileA) });
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);

		emitWorkspaceEvent('file-open', fileA);
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);

		harness.currentFile = fileA;
		(plugin.data.settings.liveUpdate as boolean) = true;
		emitWorkspaceEvent('editor-change', {}, createMarkdownView(fileA));
		expect(handleEditorChangeSpy).toHaveBeenCalledTimes(1);
	});


	test('registerFileEvents keeps sidebar content mounted when the sidebar leaf becomes active', () => {
		const { harness, fileA, emitWorkspaceEvent } = createContext();
		harness.currentFile = fileA;
		harness.influxFile = { show: true };
		harness.leaf = { id: 'sidebar-leaf' };

		harness.registerFileEvents();

		emitWorkspaceEvent('active-leaf-change', harness.leaf);

		expect(harness.currentFile).toBe(fileA);
		expect(harness.influxFile).toEqual({ show: true });
		expect(harness.root?.render).not.toHaveBeenCalled();
	});

	test('registerFileEvents ignores editor changes when live update is disabled', () => {
		const { harness, plugin, fileA, emitWorkspaceEvent, createMarkdownView } = createContext();
		const handleEditorChangeSpy = jest.spyOn(harness, 'handleEditorChange').mockResolvedValue(undefined);

		harness.registerFileEvents();
		harness.currentFile = fileA;
		(plugin.data.settings.liveUpdate as boolean) = false;

		emitWorkspaceEvent('editor-change', {}, createMarkdownView(fileA));

		expect(handleEditorChangeSpy).not.toHaveBeenCalled();
	});

});

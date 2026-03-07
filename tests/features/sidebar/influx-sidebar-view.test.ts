import { InfluxSidebarView } from '@/features/sidebar/influx-sidebar-view';
import { mockTFile } from '../../mocks';
import InfluxFile from '@/domain/backlinks/influx-file';
import { createRoot } from 'react-dom/client';

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
	const createContext = () => {
		const fileA = mockTFile('A.md', 'A');
		const fileB = mockTFile('B.md', 'B');
		const workspaceOn = jest.fn().mockReturnValue(() => {});

		const plugin = {
			data: {
				settings: {
					liveUpdate: true,
				},
			},
			api: {
				getShowStatus: jest.fn().mockReturnValue(true),
				invalidateFileCache: jest.fn(),
			},
			app: {
				workspace: {
					on: workspaceOn,
					getActiveFile: jest.fn().mockReturnValue(null),
				},
			},
		};

		const leaf = {};
		const view = new InfluxSidebarView(leaf as any, plugin as any);
		(view as any).app = plugin.app;
		(view as any).containerEl = { id: 'sidebar-root' };
		(view as any).registerEvent = jest.fn();
		(view as any).root = {
			render: jest.fn(),
			unmount: jest.fn(),
		};

		return {
			view,
			plugin,
			fileA,
			fileB,
			workspaceOn,
		};
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('updateView short-circuits when file is unchanged', async () => {
		const { view, fileA } = createContext();
		(view as any).currentFile = fileA;

		await view.updateView(fileA);

		expect((InfluxFile as any).create).not.toHaveBeenCalled();
	});

	test('updateView cancels previous request and renders empty status when file should not show', async () => {
		const { view, fileA, fileB } = createContext();
		const abort = jest.fn();
		(view as any).abortController = { abort, signal: { aborted: false } };

		(InfluxFile as any).create.mockResolvedValue({
			show: false,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		});

		await view.updateView(fileA);

		expect(abort).toHaveBeenCalledTimes(1);
		expect((view as any).currentFile).toBe(fileA);
		const renderCalls = ((view as any).root.render as jest.Mock).mock.calls;
		const lastRendered = renderCalls[renderCalls.length - 1][0];
		expect(lastRendered.props.className).toContain('influx-sidebar-status--empty');

		await view.updateView(fileB);
		expect((InfluxFile as any).create).toHaveBeenCalledWith('B.md', (view as any).plugin.api);
	});

	test('handleEditorChange renders hidden-state message when current file should be hidden', async () => {
		const { view, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockReturnValue(false);
		(view as any).currentFile = fileA;
		(view as any).influxFile = {
			show: true,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};

		await (view as any).handleEditorChange();

		expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
		const renderCalls = ((view as any).root.render as jest.Mock).mock.calls;
		const lastRendered = renderCalls[renderCalls.length - 1][0];
		expect(lastRendered.props.className).toContain('influx-sidebar-status--empty');
	});

	test('updateView ignores stale results from an older async update', async () => {
		const { view, fileA, fileB } = createContext();
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

		(InfluxFile as any).create.mockImplementation((path: string) => {
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

		expect((view as any).currentFile).toBe(fileB);
		const renderCalls = ((view as any).root.render as jest.Mock).mock.calls;
		const lastRenderArg = renderCalls[renderCalls.length - 1][0];
		expect(lastRenderArg.props.influxFile).toBe(influxB);
	});

	test('updateView renders loading state while awaiting influx file creation', async () => {
		const { view, fileA } = createContext();
		let resolveCreate: ((value: unknown) => void) | null = null;

		(InfluxFile as any).create.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveCreate = resolve;
				})
		);

		const pending = view.updateView(fileA);
		const renderCalls = ((view as any).root.render as jest.Mock).mock.calls;
		expect(renderCalls).toHaveLength(1);
		expect(renderCalls[0][0].props.className).toContain('influx-sidebar-status--loading');

		resolveCreate?.({
			show: false,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		});
		await pending;
	});

	test('handleEditorChange drops rendering when update id changes mid-flight', async () => {
		const { view, plugin, fileA } = createContext();
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

		(view as any).currentFile = fileA;
		(view as any).influxFile = influxFile;
		(view as any).abortController = { signal: { aborted: false } };
		(view as any).currentUpdateId = 10;

		const pending = (view as any).handleEditorChange();
		(view as any).currentUpdateId = 11;
		release?.();
		await pending;

		expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('A.md');
		expect((view as any).root.render).not.toHaveBeenCalled();
	});

	test('handleEditorChange does not render hidden state when request becomes stale', async () => {
		const { view, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockImplementation(() => {
			(view as any).currentUpdateId = 2;
			return false;
		});

		(view as any).currentFile = fileA;
		(view as any).influxFile = {
			show: true,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};
		(view as any).abortController = { signal: { aborted: false } };
		(view as any).currentUpdateId = 1;

		await (view as any).handleEditorChange();

		expect((view as any).root.render).not.toHaveBeenCalled();
		expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
	});

	test('handleEditorChange suppresses stale error banner when update id changes', async () => {
		const { view, plugin, fileA } = createContext();
		(plugin.api.getShowStatus as jest.Mock).mockReturnValue(true);

		(view as any).currentFile = fileA;
		(view as any).influxFile = {
			show: true,
			makeInfluxList: jest.fn().mockRejectedValue(new Error('boom')),
			toEntries: jest.fn().mockReturnValue([]),
			totalEntryCount: 0,
		};
		(view as any).abortController = { signal: { aborted: false } };
		(view as any).currentUpdateId = 4;

		const pending = (view as any).handleEditorChange();
		(view as any).currentUpdateId = 5;
		await pending;

		expect((view as any).root.render).not.toHaveBeenCalled();
	});

	test('onOpen creates a root, registers file events, and updates for the active file', async () => {
		const { view, plugin, fileA } = createContext();
		const createdRoot = {
			render: jest.fn(),
			unmount: jest.fn(),
		};
		const registerFileEventsSpy = jest.spyOn(view as any, 'registerFileEvents').mockImplementation(() => {});
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		(plugin.app.workspace.getActiveFile as jest.Mock).mockReturnValue(fileA);
		(createRoot as jest.Mock).mockReturnValue(createdRoot);

		await view.onOpen();

		expect(createRoot).toHaveBeenCalledWith((view as any).containerEl);
		expect(registerFileEventsSpy).toHaveBeenCalledTimes(1);
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);
		expect((view as any).root).toBe(createdRoot);
	});

	test('onOpen still registers events when there is no active file', async () => {
		const { view, plugin } = createContext();
		const createdRoot = {
			render: jest.fn(),
			unmount: jest.fn(),
		};
		const registerFileEventsSpy = jest.spyOn(view as any, 'registerFileEvents').mockImplementation(() => {});
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		(plugin.app.workspace.getActiveFile as jest.Mock).mockReturnValue(null);
		(createRoot as jest.Mock).mockReturnValue(createdRoot);

		await view.onOpen();

		expect(registerFileEventsSpy).toHaveBeenCalledTimes(1);
		expect(updateViewSpy).not.toHaveBeenCalled();
	});

	test('onClose aborts pending work, unmounts root, and clears sidebar state', async () => {
		const { view, fileA } = createContext();
		const abort = jest.fn();
		const unmount = jest.fn();

		(view as any).abortController = { abort };
		(view as any).root = { unmount };
		(view as any).currentFile = fileA;
		(view as any).influxFile = { show: true };

		await view.onClose();

		expect(abort).toHaveBeenCalledTimes(1);
		expect(unmount).toHaveBeenCalledTimes(1);
		expect((view as any).abortController).toBeNull();
		expect((view as any).root).toBeNull();
		expect((view as any).currentFile).toBeNull();
		expect((view as any).influxFile).toBeNull();
	});

	test('registerFileEvents wires active leaf, file open, and editor change listeners', () => {
		const { view, plugin, fileA, workspaceOn } = createContext();
		const updateViewSpy = jest.spyOn(view, 'updateView').mockResolvedValue(undefined);
		const handleEditorChangeSpy = jest.spyOn(view as any, 'handleEditorChange').mockResolvedValue(undefined);

		(view as any).registerFileEvents();

		expect(workspaceOn).toHaveBeenCalledTimes(3);
		expect((view as any).registerEvent).toHaveBeenCalledTimes(3);

		const activeLeafHandler = workspaceOn.mock.calls[0][1];
		activeLeafHandler({ view: { file: fileA } });
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);

		const fileOpenHandler = workspaceOn.mock.calls[1][1];
		fileOpenHandler(fileA);
		expect(updateViewSpy).toHaveBeenCalledWith(fileA);

		(view as any).currentFile = fileA;
		(plugin.data.settings.liveUpdate as boolean) = true;
		const editorChangeHandler = workspaceOn.mock.calls[2][1];
		editorChangeHandler({}, { file: fileA });
		expect(handleEditorChangeSpy).toHaveBeenCalledTimes(1);
	});

	test('registerFileEvents ignores editor changes when live update is disabled', () => {
		const { view, plugin, fileA, workspaceOn } = createContext();
		const handleEditorChangeSpy = jest.spyOn(view as any, 'handleEditorChange').mockResolvedValue(undefined);

		(view as any).registerFileEvents();
		(view as any).currentFile = fileA;
		(plugin.data.settings.liveUpdate as boolean) = false;

		const editorChangeHandler = workspaceOn.mock.calls[2][1];
		editorChangeHandler({}, { file: fileA });

		expect(handleEditorChangeSpy).not.toHaveBeenCalled();
	});
});

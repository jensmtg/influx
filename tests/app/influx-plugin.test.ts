import ObsidianInflux from '@/app/influx-plugin';
import { rootManager } from '@/platform/react/root-manager';
import { cacheManager } from '@/platform/cache/cache-manager';
import { updateCoordinator } from '@/app/events/update-coordinator';
import { cleanupWindowGlobals } from '@/platform/obsidian/plugin-window-guards';
import InfluxFile from '@/domain/backlinks/influx-file';
import { InlinkingFile } from '@/domain/backlinks/inlinking-file';
import { EventManager } from '@/app/events/event-manager';
import { PreviewManager } from '@/features/preview/preview-manager';
import { isDebugMode } from '@/platform/diagnostics/debug-mode';
import { requireApiVersion, TFile } from 'obsidian';

jest.mock('@/platform/react/root-manager', () => ({
	rootManager: {
		size: 0,
		getDebugInfo: jest.fn().mockReturnValue([]),
		unmountAll: jest.fn(),
	},
}));

jest.mock('@/platform/cache/cache-manager', () => ({
	cacheManager: {
		clearAll: jest.fn(),
		getDebugInfo: jest.fn().mockReturnValue({}),
	},
}));

jest.mock('@/app/events/update-coordinator', () => ({
	updateCoordinator: {
		initialize: jest.fn(),
		unload: jest.fn(),
		schedule: jest.fn(),
		getDebugInfo: jest.fn(),
	},
}));

jest.mock('@/platform/obsidian/plugin-window-guards', () => ({
	cleanupWindowGlobals: jest.fn(),
}));

jest.mock('@/platform/diagnostics/metrics', () => ({
	clearMetrics: jest.fn(),
	getMetrics: jest.fn().mockReturnValue({}),
	summarizeMetrics: jest.fn().mockReturnValue({}),
}));

jest.mock('@/platform/diagnostics/debug-mode', () => ({
	isDebugMode: jest.fn().mockReturnValue(false),
}));

jest.mock('@/domain/backlinks/influx-file', () => ({
	__esModule: true,
	default: {
		clearBuildCaches: jest.fn(),
	},
}));

jest.mock('@/domain/backlinks/inlinking-file', () => ({
	InlinkingFile: {
		clearSummaryCaches: jest.fn(),
	},
}));

jest.mock('@/app/events/event-manager', () => ({
	EventManager: jest.fn().mockImplementation(() => ({
		register: jest.fn(),
	})),
}));

jest.mock('@/features/preview/preview-manager', () => ({
	PreviewManager: jest.fn().mockImplementation(() => ({
		handlePreviewMode: jest.fn(),
		dispose: jest.fn(),
		updateAllPreviews: jest.fn(),
	})),
}));

jest.mock('@/domain/backlinks/api-adapter', () => ({
	ApiAdapter: jest.fn().mockImplementation(() => ({
		invalidateSettingsCache: jest.fn(),
	})),
}));

jest.mock('@/features/settings/settings-tab', () => ({
	ObsidianInfluxSettingsTab: jest.fn().mockImplementation(() => ({ id: 'settings-tab' })),
}));

jest.mock('@/features/editor/codemirror/async-view-plugin', () => ({
	asyncDecoBuilderExt: { name: 'async-deco-builder-ext' },
	refreshAllInfluxEditorViews: jest.fn(),
}));

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('ObsidianInflux lifecycle', () => {
	const originalDocument = global.document;
	const originalWindow = global.window;

	beforeEach(() => {
		(globalThis as typeof globalThis & { document: any }).document = {
			querySelectorAll: jest.fn().mockReturnValue([]),
		};
		(globalThis as typeof globalThis & { window: any }).window = {};
		(requireApiVersion as jest.Mock).mockReturnValue(true);
	});

	afterEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
		(globalThis as typeof globalThis & { document?: Document }).document = originalDocument;
		(globalThis as typeof globalThis & { window?: Window }).window = originalWindow;
	});

	test('onload wires startup globals, registrations, and auto-opens sidebar when enabled', async () => {
		jest.useFakeTimers();
		const app = {
			workspace: {
				detachLeavesOfType: jest.fn(),
				ensureSideLeaf: jest.fn(),
				getLeavesOfType: jest.fn().mockReturnValue([]),
				getRightLeaf: jest.fn(),
			},
			vault: {},
			metadataCache: {},
		};
		const plugin = new ObsidianInflux(app as any, {
			version: 'test-version',
		} as any);
		(plugin.loadData as jest.Mock).mockResolvedValue({
			settings: {
				showInfluxInSidebar: true,
			},
		});

		await plugin.onload();

		expect(updateCoordinator.initialize).toHaveBeenCalledTimes(1);
		expect(plugin.registerEditorExtension).toHaveBeenCalledTimes(1);
		expect(plugin.registerMarkdownPostProcessor).toHaveBeenCalledTimes(1);
		expect(plugin.registerView).toHaveBeenCalledTimes(1);
		expect(plugin.addRibbonIcon).toHaveBeenCalledTimes(1);
		expect(plugin.addCommand).toHaveBeenCalledTimes(1);
		expect(plugin.addSettingTab).toHaveBeenCalledTimes(1);
		expect(EventManager).toHaveBeenCalledTimes(1);
		expect(PreviewManager).toHaveBeenCalledTimes(1);
		expect(app.workspace.ensureSideLeaf).toHaveBeenCalledWith('influx-sidebar-view', 'right', { active: true });
		const win = globalThis.window as any;
		expect(win.influxPlugin).toBe(plugin);
		expect(win.influxDebug).toBeUndefined();
		expect(win.testInfluxReadingView).toBeUndefined();
		await plugin.onunload();
	});

		test('onload exposes debug helpers only when debug mode is enabled', async () => {
		(isDebugMode as jest.Mock).mockReturnValue(true);
		const app = {
			workspace: {
				detachLeavesOfType: jest.fn(),
				ensureSideLeaf: jest.fn(),
				getLeavesOfType: jest.fn().mockReturnValue([]),
				getRightLeaf: jest.fn(),
			},
			vault: {},
			metadataCache: {},
		};
		const plugin = new ObsidianInflux(app as any, {
			version: 'test-version',
		} as any);
		(plugin.loadData as jest.Mock).mockResolvedValue({
			settings: {
				showInfluxInSidebar: false,
			},
		});

		await plugin.onload();

		const win = globalThis.window as any;
		expect(win.influxPlugin).toBe(plugin);
		expect(typeof win.influxDebug?.getCache).toBe('function');
		expect(typeof win.influxDebug?.getUpdates).toBe('function');
		expect(typeof win.influxDebug?.snapshot).toBe('function');
		expect(typeof win.testInfluxReadingView).toBe('function');
		await plugin.onunload();
	});

	test('onunload disposes preview timers and tears down plugin state', async () => {
		const plugin = new ObsidianInflux({ workspace: {}, vault: {}, metadataCache: {} } as any, {
			version: 'test-version',
		} as any);
		const dispose = jest.fn();

		(plugin as any).previewManager = { dispose };
		plugin.updating.add('a');

		await plugin.onunload();

		expect(plugin.isUnloading).toBe(true);
		expect(updateCoordinator.unload).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(rootManager.unmountAll).toHaveBeenCalledTimes(1);
		expect(cacheManager.clearAll).toHaveBeenCalledTimes(1);
		expect(InfluxFile.clearBuildCaches).toHaveBeenCalledTimes(1);
		expect(InlinkingFile.clearSummaryCaches).toHaveBeenCalledTimes(1);
		expect(cleanupWindowGlobals).toHaveBeenCalledTimes(1);
		expect(plugin.updating.size).toBe(0);
	});

	test('closeSidebar uses documented workspace leaf detachment API', () => {
		const detachLeavesOfType = jest.fn();
		const plugin = new ObsidianInflux({
			workspace: { detachLeavesOfType },
			vault: {},
			metadataCache: {},
		} as any, {
			version: 'test-version',
		} as any);

		plugin.closeSidebar();

		expect(detachLeavesOfType).toHaveBeenCalledWith('influx-sidebar-view');
	});

	test('openSidebar falls back to right leaf view state before Obsidian 1.7.2', () => {
		(requireApiVersion as jest.Mock).mockReturnValue(false);
		const setViewState = jest.fn().mockResolvedValue(undefined);
		const targetLeaf = { setViewState };
		const plugin = new ObsidianInflux({
			workspace: {
				ensureSideLeaf: jest.fn(),
				getLeavesOfType: jest.fn().mockReturnValue([]),
				getRightLeaf: jest.fn().mockReturnValue(targetLeaf),
			},
			vault: {},
			metadataCache: {},
		} as any, {
			version: 'test-version',
		} as any);

		plugin.openSidebar();

		expect(plugin.app.workspace.ensureSideLeaf).not.toHaveBeenCalled();
		expect(plugin.app.workspace.getRightLeaf).toHaveBeenCalledWith(false);
		expect(setViewState).toHaveBeenCalledWith({ type: 'influx-sidebar-view', active: true });
	});

	test('saveSettingsByParams only commits in-memory settings and side effects after persistence succeeds', async () => {
		const plugin = new ObsidianInflux({ workspace: {}, vault: {}, metadataCache: {} } as any, {
			version: 'test-version',
		} as any);
		const invalidateSettingsCache = jest.fn();
		plugin.api = { invalidateSettingsCache } as any;
		plugin.data = { settings: { sortingPrinciple: 'NEWEST_FIRST', listLimit: 0 } } as any;
		(plugin.saveData as jest.Mock).mockRejectedValueOnce(new Error('boom'));
		const onSuccess = jest.fn();

		const failed = await plugin.saveSettingsByParams(
			{ ...(plugin.data.settings as any), sortingPrinciple: 'OLDEST_FIRST' },
			{ triggerUpdates: true, onSuccess }
		);

		expect(failed).toBe(false);
		expect(plugin.data.settings.sortingPrinciple).toBe('NEWEST_FIRST');
		expect(invalidateSettingsCache).not.toHaveBeenCalled();
		expect(onSuccess).not.toHaveBeenCalled();
		expect(updateCoordinator.schedule).not.toHaveBeenCalled();
	});

		test('triggerUpdates uses targeted preview refresh for file-open and mode-change, and global refresh elsewhere', async () => {
			const { refreshAllInfluxEditorViews } = jest.requireMock('@/features/editor/codemirror/async-view-plugin') as {
				refreshAllInfluxEditorViews: jest.Mock;
			};
		const plugin = new ObsidianInflux({ workspace: {}, vault: {}, metadataCache: {} } as any, {
			version: 'test-version',
		} as any);
		const activeFile = Object.assign(new TFile(), { path: 'Active.md' });
		const updateAllPreviews = jest.fn().mockResolvedValue(undefined);
		const updatePreviewsForFilePath = jest.fn().mockResolvedValue(undefined);
			(plugin as any).previewManager = { updateAllPreviews, updatePreviewsForFilePath };
			(updateCoordinator.schedule as jest.Mock).mockResolvedValue(undefined);
			const getScheduledTask = (op: string) => {
				const call = (updateCoordinator.schedule as jest.Mock).mock.calls.find(([, scheduledOp]) => scheduledOp === op);
				expect(call).toBeDefined();
				return call?.[3] as (signal: { aborted: boolean }) => Promise<void>;
			};

			plugin.triggerUpdates('save-settings');

			expect((updateCoordinator.schedule as jest.Mock).mock.calls.map(([scope, op, file]) => ({ scope, op, file }))).toContainEqual({
				scope: 'global',
				op: 'save-settings',
				file: undefined,
			});
			const scheduledTask = getScheduledTask('save-settings');
			await scheduledTask({ aborted: false });

			expect(refreshAllInfluxEditorViews).toHaveBeenCalledTimes(1);
			expect(updateAllPreviews).toHaveBeenCalledTimes(1);

			plugin.triggerUpdates('file-open', activeFile);
			const fileOpenTask = getScheduledTask('file-open');
			await fileOpenTask({ aborted: false });

			plugin.triggerUpdates('mode-change', activeFile);
			const modeChangeTask = getScheduledTask('mode-change');
			await modeChangeTask({ aborted: false });

			plugin.triggerUpdates('modify');
			const modifyTask = getScheduledTask('modify');
			await modifyTask({ aborted: false });

			plugin.triggerUpdates('rename');
			const renameTask = getScheduledTask('rename');
			await renameTask({ aborted: false });

			plugin.triggerUpdates('delete');
			const deleteTask = getScheduledTask('delete');
			await deleteTask({ aborted: false });

		expect(refreshAllInfluxEditorViews).toHaveBeenCalledTimes(6);
		expect(updatePreviewsForFilePath).toHaveBeenCalledTimes(2);
		expect(updatePreviewsForFilePath).toHaveBeenNthCalledWith(1, 'Active.md');
		expect(updatePreviewsForFilePath).toHaveBeenNthCalledWith(2, 'Active.md');
		expect(updateAllPreviews).toHaveBeenCalledTimes(4);
	});
});

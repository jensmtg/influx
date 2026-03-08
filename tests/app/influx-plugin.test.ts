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
	});

	afterEach(() => {
		jest.clearAllMocks();
		(globalThis as typeof globalThis & { document?: Document }).document = originalDocument;
		(globalThis as typeof globalThis & { window?: Window }).window = originalWindow;
	});

	test('onload wires startup globals, registrations, and auto-opens sidebar when enabled', async () => {
		jest.useFakeTimers();
		const app = {
			workspace: {
				ensureSideLeaf: jest.fn(),
				getLeavesOfType: jest.fn().mockReturnValue([]),
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
		jest.useRealTimers();
	});

	test('onload schedules startup editor and preview refreshes', async () => {
		jest.useFakeTimers();
		const { refreshAllInfluxEditorViews } = jest.requireMock('@/features/editor/codemirror/async-view-plugin') as {
			refreshAllInfluxEditorViews: jest.Mock;
		};
		const app = {
			workspace: {
				ensureSideLeaf: jest.fn(),
				getLeavesOfType: jest.fn().mockReturnValue([]),
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
		const previewManager = (plugin as any).previewManager;
		const updateAllPreviews = jest.spyOn(previewManager, 'updateAllPreviews').mockResolvedValue(undefined);

		jest.advanceTimersByTime(160 + 520 + 1400);
		await Promise.resolve();
		await Promise.resolve();

		expect(refreshAllInfluxEditorViews).toHaveBeenCalledTimes(3);
		expect(updateAllPreviews).toHaveBeenCalledTimes(3);
		jest.useRealTimers();
	});

	test('onload exposes debug helpers only when debug mode is enabled', async () => {
		(isDebugMode as jest.Mock).mockReturnValue(true);
		const app = {
			workspace: {
				ensureSideLeaf: jest.fn(),
				getLeavesOfType: jest.fn().mockReturnValue([]),
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
		expect(win.influxDebug).toEqual(
			expect.objectContaining({
				getCache: expect.any(Function),
				getUpdates: expect.any(Function),
				snapshot: expect.any(Function),
			})
		);
		expect(win.testInfluxReadingView).toEqual(expect.any(Function));
	});

	test('onload replaces a stale window plugin reference and skips sidebar auto-open when disabled', async () => {
		const app = {
			workspace: {
				ensureSideLeaf: jest.fn(),
				getLeavesOfType: jest.fn().mockReturnValue([]),
			},
			vault: {},
			metadataCache: {},
		};
		(globalThis.window as any).influxPlugin = { stale: true };
		const plugin = new ObsidianInflux(app as any, {
			version: 'test-version',
		} as any);
		(plugin.loadData as jest.Mock).mockResolvedValue({
			settings: {
				showInfluxInSidebar: false,
			},
		});

		await plugin.onload();

		expect((globalThis.window as any).influxPlugin).toBe(plugin);
		expect(app.workspace.ensureSideLeaf).not.toHaveBeenCalled();
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

	test('triggerUpdates refreshes open editors and previews for file, mode, and dependency-changing operations', async () => {
		const { refreshAllInfluxEditorViews } = jest.requireMock('@/features/editor/codemirror/async-view-plugin') as {
			refreshAllInfluxEditorViews: jest.Mock;
		};
		const plugin = new ObsidianInflux({ workspace: {}, vault: {}, metadataCache: {} } as any, {
			version: 'test-version',
		} as any);
		const updateAllPreviews = jest.fn().mockResolvedValue(undefined);
		(plugin as any).previewManager = { updateAllPreviews };
		(updateCoordinator.schedule as jest.Mock).mockResolvedValue(undefined);

		plugin.triggerUpdates('save-settings');

		expect(updateCoordinator.schedule).toHaveBeenCalledWith('global', 'save-settings', undefined, expect.any(Function));
		const scheduledTask = (updateCoordinator.schedule as jest.Mock).mock.calls[0][3] as (signal: { aborted: boolean }) => Promise<void>;
		await scheduledTask({ aborted: false });

		expect(refreshAllInfluxEditorViews).toHaveBeenCalledTimes(1);
		expect(updateAllPreviews).toHaveBeenCalledTimes(1);

		plugin.triggerUpdates('file-open');
		const fileOpenTask = (updateCoordinator.schedule as jest.Mock).mock.calls[1][3] as (signal: { aborted: boolean }) => Promise<void>;
		await fileOpenTask({ aborted: false });

		plugin.triggerUpdates('mode-change');
		const modeChangeTask = (updateCoordinator.schedule as jest.Mock).mock.calls[2][3] as (signal: { aborted: boolean }) => Promise<void>;
		await modeChangeTask({ aborted: false });

		plugin.triggerUpdates('modify');
		const modifyTask = (updateCoordinator.schedule as jest.Mock).mock.calls[3][3] as (signal: { aborted: boolean }) => Promise<void>;
		await modifyTask({ aborted: false });

		plugin.triggerUpdates('rename');
		const renameTask = (updateCoordinator.schedule as jest.Mock).mock.calls[4][3] as (signal: { aborted: boolean }) => Promise<void>;
		await renameTask({ aborted: false });

		plugin.triggerUpdates('delete');
		const deleteTask = (updateCoordinator.schedule as jest.Mock).mock.calls[5][3] as (signal: { aborted: boolean }) => Promise<void>;
		await deleteTask({ aborted: false });

		expect(refreshAllInfluxEditorViews).toHaveBeenCalledTimes(6);
		expect(updateAllPreviews).toHaveBeenCalledTimes(6);
	});
});

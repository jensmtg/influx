import ObsidianInflux from '@/app/influx-plugin';
import { rootManager } from '@/platform/react/root-manager';
import { cacheManager } from '@/platform/cache/cache-manager';
import { updateCoordinator } from '@/app/events/update-coordinator';
import { cleanupWindowGlobals } from '@/platform/obsidian/plugin-window-guards';
import InfluxFile from '@/domain/backlinks/influx-file';
import { InlinkingFile } from '@/domain/backlinks/inlinking-file';
import { EventManager } from '@/app/events/event-manager';
import { PreviewManager } from '@/features/preview/preview-manager';

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
		expect(win.influxDebug).toEqual(
			expect.objectContaining({
				getCache: expect.any(Function),
				getUpdates: expect.any(Function),
				snapshot: expect.any(Function),
			})
		);
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
		plugin.updating.set('a', Date.now());

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
});

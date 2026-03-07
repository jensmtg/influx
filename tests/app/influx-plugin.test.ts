import ObsidianInflux from '@/app/influx-plugin';
import { rootManager } from '@/platform/react/root-manager';
import { cacheManager } from '@/platform/cache/cache-manager';
import { updateCoordinator } from '@/app/events/update-coordinator';
import { cleanupWindowGlobals } from '@/platform/obsidian/plugin-window-guards';

jest.mock('@/platform/react/root-manager', () => ({
	rootManager: {
		unmountAll: jest.fn(),
	},
}));

jest.mock('@/platform/cache/cache-manager', () => ({
	cacheManager: {
		clearAll: jest.fn(),
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

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('ObsidianInflux lifecycle', () => {
	afterEach(() => {
		jest.clearAllMocks();
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
		expect(cleanupWindowGlobals).toHaveBeenCalledTimes(1);
		expect(plugin.updating.size).toBe(0);
	});
});

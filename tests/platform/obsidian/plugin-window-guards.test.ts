import {
	cleanupWindowGlobals,
	getBacklinksForFileSafely,
	getMetadataCacheSafely,
	getPlugin,
	hasBacklinksForFile,
	isMinimalPluginInterface,
	isPluginUnloading,
} from '../../../src/platform/obsidian/plugin-window-guards';
import { logger } from '../../../src/platform/diagnostics/logger';

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

type TestWindow = Window & {
	influxPlugin?: unknown;
	influxDebug?: unknown;
	testInfluxReadingView?: () => void;
};

function setWindow(windowValue: TestWindow): void {
	Object.defineProperty(globalThis, 'window', {
		value: windowValue,
		configurable: true,
		writable: true,
	});
}

describe('plugin-window-guards', () => {
	const originalWindow = globalThis.window;

	afterEach(() => {
		setWindow(originalWindow);
		jest.clearAllMocks();
	});

	test('getPlugin returns plugin when required shape is present', () => {
		const plugin = {
			data: { settings: { liveUpdate: true } },
			api: { invalidateSettingsCache: jest.fn() },
			app: { metadataCache: {} },
		};
		setWindow({ influxPlugin: plugin } as unknown as TestWindow);

		expect(getPlugin()).toBe(plugin);
	});

	test('getPlugin returns null for missing or invalid plugin shape', () => {
		setWindow({} as TestWindow);
		expect(getPlugin()).toBeNull();

		setWindow({
			influxPlugin: { data: {}, api: {} },
		} as unknown as TestWindow);
		expect(getPlugin()).toBeNull();
	});

	test('isMinimalPluginInterface validates the minimum runtime bridge shape', () => {
		expect(
			isMinimalPluginInterface({
				data: { settings: {} },
				api: { invalidateSettingsCache: jest.fn() },
				app: { metadataCache: {} },
			})
		).toBe(true);

		expect(
			isMinimalPluginInterface({
				data: {},
				api: { invalidateSettingsCache: jest.fn() },
				app: { metadataCache: {} },
			})
		).toBe(false);
	});

	test('isPluginUnloading returns true when plugin is missing or flagged unloading', () => {
		setWindow({} as TestWindow);
		expect(isPluginUnloading()).toBe(true);

		setWindow({
			influxPlugin: {
				data: { settings: {} },
				api: { invalidateSettingsCache: jest.fn() },
				app: { metadataCache: {} },
				isUnloading: false,
			},
		} as unknown as TestWindow);
		expect(isPluginUnloading()).toBe(false);

		(globalThis.window as TestWindow).influxPlugin = {
			data: { settings: {} },
			api: { invalidateSettingsCache: jest.fn() },
			app: { metadataCache: {} },
			isUnloading: true,
		};
		expect(isPluginUnloading()).toBe(true);
	});

	test('cleanupWindowGlobals removes plugin debug and test globals', () => {
		setWindow({
			influxPlugin: { app: {}, api: {}, data: {} },
			influxDebug: { snapshot: jest.fn() },
			testInfluxReadingView: jest.fn(),
		} as unknown as TestWindow);

		cleanupWindowGlobals();

		expect((globalThis.window as TestWindow).influxPlugin).toBeUndefined();
		expect((globalThis.window as TestWindow).influxDebug).toBeUndefined();
		expect((globalThis.window as TestWindow).testInfluxReadingView).toBeUndefined();
	});

	test('hasBacklinksForFile checks callable metadata cache shape', () => {
		expect(hasBacklinksForFile(null)).toBe(false);
		expect(hasBacklinksForFile({})).toBe(false);
		expect(hasBacklinksForFile({ getBacklinksForFile: 'nope' })).toBe(false);
		expect(hasBacklinksForFile({ getBacklinksForFile: () => ({ data: new Map() }) })).toBe(true);
	});

	test('getMetadataCacheSafely returns metadata cache or null', () => {
		expect(getMetadataCacheSafely({ metadataCache: { ok: true } })).toEqual({ ok: true });
		expect(getMetadataCacheSafely({ metadataCache: null })).toBeNull();
		expect(getMetadataCacheSafely(undefined)).toBeNull();
	});

	test('getBacklinksForFileSafely returns null when method is unavailable', () => {
		expect(getBacklinksForFileSafely({}, { path: 'Target.md' })).toBeNull();
	});

	test('getBacklinksForFileSafely returns backlinks when metadata cache call succeeds', () => {
		const backlinks = { data: new Map([['Source.md', []]]) };
		const metadataCache = {
			getBacklinksForFile: jest.fn().mockReturnValue(backlinks),
		};

		expect(getBacklinksForFileSafely(metadataCache, { path: 'Target.md' })).toBe(backlinks);
		expect(metadataCache.getBacklinksForFile).toHaveBeenCalledWith({ path: 'Target.md' });
	});

	test('getBacklinksForFileSafely swallows errors and logs warning', () => {
		const error = new Error('boom');
		const metadataCache = {
			getBacklinksForFile: jest.fn(() => {
				throw error;
			}),
		};

		expect(getBacklinksForFileSafely(metadataCache, { path: 'Target.md' })).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith('Failed to call getBacklinksForFile', { error });
	});
});

import { PreviewManager } from '@/features/preview/preview-manager';
import { rootManager } from '@/platform/react/root-manager';
import { cacheManager } from '@/platform/cache/cache-manager';
import { requireApiVersion } from 'obsidian';
import * as renderPipeline from '@/domain/backlinks/influx-render-pipeline';

jest.mock('react-dom/client', () => ({
	createRoot: jest.fn(() => ({
		render: jest.fn(),
		unmount: jest.fn(),
	})),
}));

describe('PreviewManager', () => {
	const originalDocument = (globalThis as { document?: Document }).document;
	const originalWindow = (globalThis as { window?: Window }).window;
	const originalSetTimeout = global.setTimeout;
	const originalClearTimeout = global.clearTimeout;
	const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

	beforeEach(() => {
		jest.spyOn(console, 'info').mockImplementation(() => {});
		(requireApiVersion as jest.Mock).mockReturnValue(true);
		global.setTimeout = (((handler: TimerHandler, timeout?: number, ...args: any[]) => {
			const timer = originalSetTimeout((...innerArgs: any[]) => {
				pendingTimers.delete(timer);
				if (typeof handler === 'function') {
					(handler as (...callArgs: any[]) => void)(...innerArgs);
					return;
				}
				eval(handler);
			}, timeout, ...args);
			pendingTimers.add(timer);
			return timer;
		}) as unknown) as typeof setTimeout;
		global.clearTimeout = (((timer: ReturnType<typeof setTimeout>) => {
			pendingTimers.delete(timer);
			return originalClearTimeout(timer);
		}) as unknown) as typeof clearTimeout;
	});

	afterEach(() => {
		for (const timer of pendingTimers) {
			originalClearTimeout(timer);
		}
		pendingTimers.clear();
		cacheManager.clearAll();
		rootManager.unmountAll();
		jest.restoreAllMocks();
		global.setTimeout = originalSetTimeout;
		global.clearTimeout = originalClearTimeout;
		(globalThis as { document?: Document }).document = originalDocument;
		(globalThis as { window?: Window }).window = originalWindow;
	});

	// CRITICAL BEHAVIOR: When sidebar mode is enabled, preview roots should be cleaned up
	test('updateAllPreviews cleans up preview roots when sidebar mode is enabled', async () => {
		const querySelectorAll = jest.fn().mockReturnValue([]);
		(globalThis as { document?: Document }).document = {
			querySelectorAll,
		} as unknown as Document;

		const iterateRootLeaves = jest.fn();
		const plugin = {
			data: { settings: { showInfluxInSidebar: true } },
			app: { workspace: { iterateRootLeaves } },
			updating: new Set<string>(),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);
		const unmountByTypeSpy = jest.spyOn(rootManager, 'unmountByType').mockImplementation(() => {});

		await manager.updateAllPreviews();

		expect(unmountByTypeSpy).toHaveBeenCalledWith('preview');
		expect(querySelectorAll).toHaveBeenCalled();
		expect(iterateRootLeaves).not.toHaveBeenCalled();
	});

	// CRITICAL BEHAVIOR: dispose cancels pending work - prevents memory leaks and stale renders
	test('dispose properly cancels pending work and clears state', async () => {
		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);

		// Simulate scheduled work
		(manager as any).scheduledPreviewRefreshTimers.set('Test.md', setTimeout(() => {}, 10000));
		(manager as any).postProcessorHosts.set('Test.md', {
			filePath: 'Test.md',
			previewRoot: {} as HTMLElement,
			container: {} as HTMLElement,
		});

		manager.dispose();

		// All state should be cleared
		expect((manager as any).scheduledPreviewRefreshTimers.size).toBe(0);
		expect((manager as any).postProcessorHosts.size).toBe(0);
		expect((manager as any).inflightPostProcessorRenders.size).toBe(0);
		expect((manager as any).disposed).toBe(true);
	});

	// CRITICAL BEHAVIOR: Modern preview mode (1.7.2+) uses deferred loading
	test('updateAllPreviews skips deferred leaves during global refreshes on older versions', async () => {
		const previewRoot = {
			classList: { contains: (_name: string) => false },
			querySelectorAll: jest.fn().mockReturnValue([]),
		} as unknown as HTMLElement;

		(globalThis as { document?: Document }).document = {
			querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
		} as unknown as Document;

		const deferredLeaf = {
			getViewState: jest.fn().mockReturnValue({ type: 'markdown' }),
			containerEl: { id: 'leaf-container' },
			view: { mode: 'preview', file: { path: 'Deferred.md', stat: { mtime: 1 } } },
			isDeferred: true,
			loadIfDeferred: jest.fn().mockResolvedValue(undefined),
		};

		const iterateRootLeaves = jest.fn((cb: (leaf: any) => void) => cb(deferredLeaf));

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves } },
			updating: new Set<string>(),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);
		jest.spyOn(manager as any, 'getUntrackedPreviewLeaves').mockResolvedValue([]);

		await manager.updateAllPreviews();

		// Deferred leaves should not be loaded during global refreshes
		expect(deferredLeaf.loadIfDeferred).not.toHaveBeenCalled();
	});

	// CRITICAL BEHAVIOR: Tracked hosts take precedence over untracked leaves
	test('updateAllPreviews uses tracked hosts when available instead of falling back to leaf iteration', async () => {
		const previewRoot = {
			classList: { contains: (_name: string) => false },
			querySelectorAll: jest.fn().mockReturnValue([]),
			querySelector: jest.fn().mockReturnValue({ id: 'container' }),
			appendChild: jest.fn(),
			findFirstPlugin: jest.fn(),
		} as unknown as HTMLElement;

		// Mock find to return a preview root with an Influx container
		const documentMock = {
			querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
		} as unknown as Document;
		(globalThis as { document?: Document }).document = documentMock;

		const iterateRootLeaves = jest.fn();
		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves } },
			updating: new Set<string>(),
		} as any;
		const api = { getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 1 } }) } as any;
		const manager = new PreviewManager(plugin, api);

		// Mock getTrackedPreviewHosts to return a tracked host
		jest.spyOn(manager as any, 'getTrackedPreviewHosts').mockReturnValue([
			{ container: { id: 'host' } as HTMLElement, filePath: 'Test.md', previewRoot },
		]);
		jest.spyOn(manager as any, 'getUntrackedPreviewLeaves').mockResolvedValue([]);

		await manager.updateAllPreviews();

		// If tracked hosts exist, leaf iteration should not be needed
		expect(iterateRootLeaves).not.toHaveBeenCalled();
	});

	// CRITICAL BEHAVIOR: Hidden preview results clean up stale preview UI
	// When a preview file has no visible content (hidden), ensure no stale React roots remain
	test('hidden preview results do not leave stale React roots in rootManager', async () => {
		// Setup: Create a mock preview root
		const previewRoot = {
			classList: { contains: (_name: string) => false },
			querySelectorAll: jest.fn().mockReturnValue([]),
			querySelector: jest.fn().mockReturnValue(null),
		} as unknown as HTMLElement;

		const documentMock = {
			querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
		} as unknown as Document;
		(globalThis as { document?: Document }).document = documentMock;

		// Mock createInfluxFileForRender to return hidden=true (simulating no visible backlinks)
		jest.spyOn(renderPipeline, 'createInfluxFileForRender').mockResolvedValue({
			hidden: true,
			influxFile: { show: false, uuid: 'test-uuid' } as any,
		});

		const plugin = {
			data: {
				settings: {
					showInfluxInSidebar: false,
					frontmatterProperties: [],
				},
			},
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const api = {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 1 } }),
			getSettings: jest.fn().mockReturnValue({ frontmatterProperties: [] }),
		} as any;
		const manager = new PreviewManager(plugin, api);

		// Mock getUntrackedPreviewLeaves to return empty so no leaf processing happens
		jest.spyOn(manager as any, 'getUntrackedPreviewLeaves').mockResolvedValue([]);

		await manager.updateAllPreviews();

		// Verify no preview roots were registered
		// This is the behavior-level outcome: hidden results should not create React roots
		const allRoots = Array.from((rootManager as any).roots?.values() || []);
		const previewRoots = allRoots.filter((r: any) => r.type === 'preview');
		expect(previewRoots).toHaveLength(0);
	});
});

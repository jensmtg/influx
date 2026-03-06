import { PreviewManager } from '@/features/preview/preview-manager';
import { rootManager } from '@/platform/react/root-manager';
import { CONSTANTS } from '@/config/constants';

describe('PreviewManager', () => {
	const originalDocument = (globalThis as { document?: Document }).document;
	const originalWindow = (globalThis as { window?: Window }).window;

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
		(globalThis as { document?: Document }).document = originalDocument;
		(globalThis as { window?: Window }).window = originalWindow;
	});

	test('updateAllPreviews cleans preview roots and wrappers when sidebar mode is enabled', async () => {
		const removeA = jest.fn();
		const removeB = jest.fn();
		const querySelectorAll = jest.fn().mockReturnValue([
			{ remove: removeA },
			{ remove: removeB },
		]);
		(globalThis as { document?: Document }).document = {
			querySelectorAll,
		} as unknown as Document;

		const iterateRootLeaves = jest.fn();
		const plugin = {
			data: { settings: { showInfluxInSidebar: true } },
			app: { workspace: { iterateRootLeaves } },
			updating: new Map<string, number>(),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);
		const unmountByTypeSpy = jest.spyOn(rootManager, 'unmountByType').mockImplementation(() => {});

		await manager.updateAllPreviews();

		expect(unmountByTypeSpy).toHaveBeenCalledWith('preview');
		expect(querySelectorAll).toHaveBeenCalledWith(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
		expect(removeA).toHaveBeenCalledTimes(1);
		expect(removeB).toHaveBeenCalledTimes(1);
		expect(iterateRootLeaves).not.toHaveBeenCalled();
	});

	test('updatePreview retries preview root lookup before sidebar cleanup', async () => {
		jest.useFakeTimers();

		const innerContainer = { remove: jest.fn() } as unknown as HTMLElement;
		const wrapper = { remove: jest.fn() } as unknown as Element;
		const previewRoot = {
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [innerContainer];
				}
				return [wrapper];
			}),
		} as unknown as HTMLElement;
		let queryCount = 0;
		const containerEl = {
			querySelector: jest.fn().mockImplementation(() => {
				queryCount += 1;
				return queryCount === 1 ? null : previewRoot;
			}),
		} as unknown as HTMLDivElement;
		const leaf = {
			view: {
				file: { path: 'Scratchpad.md' },
				currentMode: { type: 'preview' },
			},
			containerEl,
		};

		const plugin = {
			data: { settings: { showInfluxInSidebar: true } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Map<string, number>(),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);

		const unmountSpy = jest.spyOn(rootManager, 'unmountDeferred').mockImplementation(() => {});
		const unmountByPathSpy = jest.spyOn(rootManager, 'unmountByFilePath').mockImplementation(() => {});
		(globalThis as { window?: Window }).window = {
			setTimeout,
		} as unknown as Window;

		const promise = manager.updatePreview(leaf as any);
		jest.advanceTimersByTime(80);
		await promise;

		expect(containerEl.querySelector).toHaveBeenCalledTimes(2);
		expect(unmountSpy).toHaveBeenCalledWith(innerContainer);
		expect(unmountByPathSpy).not.toHaveBeenCalled();
	});

	test('handlePreviewMode sidebar cleanup is scoped to local preview root', async () => {
		const innerContainer = { remove: jest.fn() } as unknown as HTMLElement;
		const wrapper = { remove: jest.fn() } as unknown as Element;
		const previewRoot = {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [innerContainer];
				}
				return [wrapper];
			}),
		} as unknown as HTMLElement;

		const plugin = {
			data: { settings: { showInfluxInSidebar: true } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Map<string, number>(),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);

		const unmountSpy = jest.spyOn(rootManager, 'unmountDeferred').mockImplementation(() => {});
		const unmountByPathSpy = jest.spyOn(rootManager, 'unmountByFilePath').mockImplementation(() => {});

		await manager.handlePreviewMode(previewRoot, {
			sourcePath: 'Shared.md',
		} as any);

		expect(unmountSpy).toHaveBeenCalledWith(innerContainer);
		expect(unmountByPathSpy).not.toHaveBeenCalled();
	});

	test('handlePreviewMode coalesces repeated post-processor calls per file', async () => {
		jest.useFakeTimers();

		const previewRoot = {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
		} as unknown as HTMLElement;

		const leaf = {
			view: {
				file: { path: 'Shared.md' },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelector: jest.fn(),
			},
		};

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => cb(leaf)),
				},
			},
			updating: new Map<string, number>(),
		} as any;

		const manager = new PreviewManager(plugin, {} as any);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);

		await manager.handlePreviewMode(previewRoot, { sourcePath: 'Shared.md' } as any);
		await manager.handlePreviewMode(previewRoot, { sourcePath: 'Shared.md' } as any);
		await manager.handlePreviewMode(previewRoot, { sourcePath: 'Shared.md' } as any);

		expect(updatePreviewSpy).not.toHaveBeenCalled();

		jest.advanceTimersByTime(100);
		await Promise.resolve();
		await Promise.resolve();

		expect(updatePreviewSpy).toHaveBeenCalledTimes(1);
		expect(updatePreviewSpy).toHaveBeenCalledWith(leaf);
	});

	test('updateAllPreviews throttles repeated updates for same file path', async () => {
		const nowSpy = jest.spyOn(Date, 'now');
		nowSpy.mockReturnValue(1000);

		const leaf = {
			view: {
				file: { path: 'Scratchpad.md' },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelector: jest.fn(),
			},
		};

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => cb(leaf)),
				},
			},
			updating: new Map<string, number>([['Scratchpad.md::1', 500]]),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(updatePreviewSpy).not.toHaveBeenCalled();
		expect(plugin.updating.get('Scratchpad.md::1')).toBe(500);
		nowSpy.mockRestore();
	});

	test('updateAllPreviews does not throttle separate panes for the same file path', async () => {
		const sharedPath = 'Shared.md';
		const leafA = {
			view: {
				file: { path: sharedPath },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		};
		const leafB = {
			view: {
				file: { path: sharedPath },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		};

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => {
						cb(leafA);
						cb(leafB);
					}),
				},
			},
			updating: new Map<string, number>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(updatePreviewSpy).toHaveBeenCalledTimes(2);
		expect(updatePreviewSpy).toHaveBeenNthCalledWith(1, leafA);
		expect(updatePreviewSpy).toHaveBeenNthCalledWith(2, leafB);
	});

	test('updateAllPreviews throttles while in flight, then allows next cycle after settle', async () => {
		const sharedPath = 'Shared.md';
		const leafA = {
			view: {
				file: { path: sharedPath },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		};
		const leafB = {
			view: {
				file: { path: sharedPath },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		};

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => {
						cb(leafA);
						cb(leafB);
					}),
				},
			},
			updating: new Map<string, number>(),
		} as any;

		let release: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const manager = new PreviewManager(plugin, {} as any);
		const updatePreviewSpy = jest
			.spyOn(manager, 'updatePreview')
			.mockImplementation(async () => {
				await gate;
			});

		const firstCycle = manager.updateAllPreviews();
		await Promise.resolve();

		// While first cycle is in flight, same panes should be throttled.
		await manager.updateAllPreviews();
		expect(updatePreviewSpy).toHaveBeenCalledTimes(2);

		release?.();
		await firstCycle;

		// After settle, next cycle should run again for both panes.
		const doneGate = Promise.resolve();
		updatePreviewSpy.mockImplementation(async () => {
			await doneGate;
		});
		await manager.updateAllPreviews();
		expect(updatePreviewSpy).toHaveBeenCalledTimes(4);
	});
});

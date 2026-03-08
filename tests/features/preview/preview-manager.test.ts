import { PreviewManager } from '@/features/preview/preview-manager';
import { rootManager } from '@/platform/react/root-manager';
import { cacheManager } from '@/platform/cache/cache-manager';
import { CONSTANTS } from '@/config/constants';
import InfluxFile from '@/domain/backlinks/influx-file';
import * as ReactDomClient from 'react-dom/client';

jest.mock('react-dom/client', () => ({
	createRoot: jest.fn(() => ({
		render: jest.fn(),
		unmount: jest.fn(),
	})),
}));

describe('PreviewManager', () => {
	const originalDocument = (globalThis as { document?: Document }).document;
	const originalHTMLElement = (globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement;
	const originalWindow = (globalThis as { window?: Window }).window;

	class MockHTMLElement {
		classList = { contains: (_name: string) => false };
		closest = jest.fn().mockReturnValue(null);
		querySelector = jest.fn().mockReturnValue(null);
		querySelectorAll = jest.fn().mockReturnValue([]);
		remove = jest.fn();
	}

	afterEach(() => {
		jest.useRealTimers();
		jest.clearAllMocks();
		jest.restoreAllMocks();
		(globalThis as { document?: Document }).document = originalDocument;
		(globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = originalHTMLElement;
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
			updating: new Set<string>(),
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
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [innerContainer];
				}
				return [wrapper];
			}),
		} as unknown as HTMLElement;
		let queryCount = 0;
		const containerEl = {
			querySelectorAll: jest.fn().mockImplementation(() => {
				queryCount += 1;
				return queryCount === 1 ? [] : [previewRoot];
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
			updating: new Set<string>(),
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

		expect(containerEl.querySelectorAll).toHaveBeenCalledTimes(2);
		expect(unmountSpy).toHaveBeenCalledWith(innerContainer);
		expect(unmountByPathSpy).not.toHaveBeenCalled();
	});

	test('handlePreviewMode sidebar cleanup is scoped to local preview root', async () => {
		(globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;
		const innerContainer = new MockHTMLElement() as unknown as HTMLElement;
		innerContainer.remove = jest.fn();
		const wrapper = { remove: jest.fn() } as unknown as Element;
		const previewRoot = Object.assign(new MockHTMLElement(), {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [innerContainer];
				}
				return [wrapper];
			}),
		}) as unknown as HTMLElement;

		const plugin = {
			data: { settings: { showInfluxInSidebar: true } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
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
		(globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;

		const previewRoot = Object.assign(new MockHTMLElement(), {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
		}) as unknown as HTMLElement;

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
			updating: new Set<string>(),
		} as any;

			const manager = new PreviewManager(plugin, {} as any);
			const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);
			const refreshDelays = (PreviewManager as any).POST_PROCESS_REFRESH_DELAYS_MS as number[];

			await manager.handlePreviewMode(previewRoot, { sourcePath: 'Shared.md' } as any);
			await manager.handlePreviewMode(previewRoot, { sourcePath: 'Shared.md' } as any);
			await manager.handlePreviewMode(previewRoot, { sourcePath: 'Shared.md' } as any);

			expect(updatePreviewSpy).not.toHaveBeenCalled();

			for (const delay of refreshDelays) {
				jest.advanceTimersByTime(delay + 1);
				await Promise.resolve();
				await Promise.resolve();
			}
			jest.runOnlyPendingTimers();
			await Promise.resolve();
			await Promise.resolve();

			expect(updatePreviewSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
			expect(updatePreviewSpy.mock.calls.length).toBeLessThanOrEqual(refreshDelays.length);
			expect(updatePreviewSpy).toHaveBeenNthCalledWith(1, leaf);
			expect(updatePreviewSpy).toHaveBeenLastCalledWith(leaf);
		});

	test('handlePreviewMode still schedules refresh when preview root is delayed by later post-processing', async () => {
		jest.useFakeTimers();
		(globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;

		const lateElement = Object.assign(new MockHTMLElement(), {
			classList: {
				contains: () => false,
			},
			closest: jest.fn().mockReturnValue(null),
			querySelector: jest.fn().mockReturnValue(null),
		}) as unknown as HTMLElement;

		const leaf = {
			view: {
				file: { path: 'QueryHeavy.md' },
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
			updating: new Set<string>(),
		} as any;

		const manager = new PreviewManager(plugin, {} as any);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);
			const [refreshDelay] = (PreviewManager as any).POST_PROCESS_REFRESH_DELAYS_MS as number[];

		await manager.handlePreviewMode(lateElement, { sourcePath: 'QueryHeavy.md' } as any);

		expect(updatePreviewSpy).not.toHaveBeenCalled();
		jest.advanceTimersByTime(refreshDelay + 1);
		await Promise.resolve();
		await Promise.resolve();

		expect(updatePreviewSpy).toHaveBeenCalledTimes(1);
		expect(updatePreviewSpy).toHaveBeenCalledWith(leaf);
	});

	test('dispose clears pending refresh timers before they run', async () => {
		jest.useFakeTimers();
		(globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;

		const previewRoot = Object.assign(new MockHTMLElement(), {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
		}) as unknown as HTMLElement;

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn(),
				},
			},
			updating: new Set<string>(),
			isUnloading: false,
		} as any;

		const manager = new PreviewManager(plugin, {} as any);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);
			const [refreshDelay] = (PreviewManager as any).POST_PROCESS_REFRESH_DELAYS_MS as number[];

		await manager.handlePreviewMode(previewRoot, { sourcePath: 'Dispose.md' } as any);
		manager.dispose();
		jest.advanceTimersByTime(refreshDelay + 1);
		await Promise.resolve();

		expect(updatePreviewSpy).not.toHaveBeenCalled();
	});

	test('handlePreviewMode bails early while plugin is unloading', async () => {
		jest.useFakeTimers();
		(globalThis as { HTMLElement?: typeof HTMLElement }).HTMLElement = MockHTMLElement as unknown as typeof HTMLElement;

		const previewRoot = Object.assign(new MockHTMLElement(), {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
		}) as unknown as HTMLElement;

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn(),
				},
			},
			updating: new Set<string>(),
			isUnloading: true,
		} as any;

		const manager = new PreviewManager(plugin, {} as any);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);
			const [refreshDelay] = (PreviewManager as any).POST_PROCESS_REFRESH_DELAYS_MS as number[];

		await manager.handlePreviewMode(previewRoot, { sourcePath: 'Unload.md' } as any);
		jest.advanceTimersByTime(refreshDelay + 1);
		await Promise.resolve();

		expect(updatePreviewSpy).not.toHaveBeenCalled();
		expect(plugin.app.workspace.iterateRootLeaves).not.toHaveBeenCalled();
	});

	test('updatePreview keeps the tracked container when duplicate wrappers exist in one pane', async () => {
		const trackedRoot = { render: jest.fn() };
		const duplicateContainer = {
			remove: jest.fn(),
		} as unknown as HTMLElement;
		const trackedContainer = {
			remove: jest.fn(),
		} as unknown as HTMLElement;
		const duplicateWrapper = {
			querySelector: jest.fn().mockReturnValue(duplicateContainer),
			remove: jest.fn(),
		};
		const trackedWrapper = {
			querySelector: jest.fn().mockReturnValue(trackedContainer),
			remove: jest.fn(),
		};
		const previewRoot = {
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.startsWith('.')) {
					return [duplicateWrapper, trackedWrapper];
				}
				return [duplicateContainer, trackedContainer];
			}),
		} as unknown as HTMLElement;
		const leaf = {
			view: {
				file: { path: 'Shared.md', stat: { mtime: 123 } },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
			},
		};
		const influxFile = {
			uuid: 'tracked-uuid',
			show: true,
			totalEntryCount: 1,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);

		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(cacheManager, 'getPreviewFileHash').mockReturnValue(undefined);
		jest.spyOn(cacheManager, 'setPreviewFileHash').mockImplementation(() => {});
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		const hasSpy = jest.spyOn(rootManager, 'has').mockImplementation((container: HTMLElement) => container === trackedContainer);
		jest.spyOn(rootManager, 'get').mockImplementation((container: HTMLElement) => {
			if (container === trackedContainer) {
				return {
					root: trackedRoot as any,
					container: trackedContainer,
					type: 'preview',
					filePath: 'Shared.md',
					createdAt: Date.now(),
				};
			}
			return undefined;
		});
		const unmountDeferredSpy = jest.spyOn(rootManager, 'unmountDeferred').mockImplementation(() => {});
		await manager.updatePreview(leaf as any);

		expect(hasSpy).toHaveBeenCalledWith(duplicateContainer);
		expect(hasSpy).toHaveBeenCalledWith(trackedContainer);
		expect(unmountDeferredSpy).toHaveBeenCalledWith(duplicateContainer);
		expect(unmountDeferredSpy).toHaveBeenCalledWith(trackedContainer);
		expect(duplicateWrapper.remove).toHaveBeenCalledTimes(1);
		expect(trackedWrapper.remove).not.toHaveBeenCalled();
		expect(ReactDomClient.createRoot).not.toHaveBeenCalled();
		expect(trackedRoot.render).toHaveBeenCalledTimes(1);
	});

	test('updatePreview replaces an untracked stale container with a fresh root', async () => {
		const replacementContainer = { id: '' } as HTMLElement;
		const staleContainer = {
			id: 'stale-id',
			replaceWith: jest.fn(),
		} as unknown as HTMLElement;
		const wrapper = {
			querySelector: jest.fn().mockReturnValue(staleContainer),
			remove: jest.fn(),
		};
		const previewRoot = {
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.startsWith('.')) {
					return [wrapper];
				}
				return [staleContainer];
			}),
		} as unknown as HTMLElement;
		const leaf = {
			view: {
				file: { path: 'Stale.md', stat: { mtime: 456 } },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
			},
		};
		const influxFile = {
			uuid: 'fresh-uuid',
			show: true,
			totalEntryCount: 1,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};
		const freshRoot = { render: jest.fn() };

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);

		(globalThis as { document?: Document }).document = {
			createElement: jest.fn().mockReturnValue(replacementContainer),
		} as unknown as Document;
		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(cacheManager, 'getPreviewFileHash').mockReturnValue(undefined);
		jest.spyOn(cacheManager, 'setPreviewFileHash').mockImplementation(() => {});
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		jest.spyOn(rootManager, 'has').mockReturnValue(false);
		jest.spyOn(rootManager, 'get').mockReturnValue(undefined);
		const unmountDeferredSpy = jest.spyOn(rootManager, 'unmountDeferred').mockImplementation(() => {});
		const registerSpy = jest.spyOn(rootManager, 'register').mockImplementation(() => {});
		(ReactDomClient.createRoot as jest.Mock).mockReturnValue(freshRoot as any);

		await manager.updatePreview(leaf as any);

		expect(unmountDeferredSpy).toHaveBeenCalledWith(staleContainer);
		expect(staleContainer.replaceWith).toHaveBeenCalledWith(replacementContainer);
		expect(replacementContainer.id).toBe('fresh-uuid');
		expect(ReactDomClient.createRoot).toHaveBeenCalledWith(replacementContainer);
		expect(registerSpy).toHaveBeenCalledWith(replacementContainer, freshRoot, 'preview', 'Stale.md');
		expect(freshRoot.render).toHaveBeenCalledTimes(1);
		expect(wrapper.remove).not.toHaveBeenCalled();
	});

	test('updatePreview prefers the visible preview root when stale hidden roots are also present', async () => {
		const render = jest.fn();
		const visiblePreviewRoot = {
			remove: jest.fn(),
			checkVisibility: jest.fn().mockReturnValue(true),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.startsWith('.')) {
					return [];
				}
				return [];
			}),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const hiddenPreviewRoot = {
			remove: jest.fn(),
			checkVisibility: jest.fn().mockReturnValue(false),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.startsWith('.')) {
					return [];
				}
				return [];
			}),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const leaf = {
			view: {
				file: { path: 'Reading.md', stat: { mtime: 321 } },
				currentMode: { type: 'preview' },
			},
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([hiddenPreviewRoot, visiblePreviewRoot]),
			},
		};
		const influxFile = {
			uuid: 'visible-uuid',
			show: true,
			totalEntryCount: 5,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};
		const wrapper = { appendChild: jest.fn() } as unknown as HTMLElement;
		const createdContainer = { id: '' } as HTMLElement;

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);

		(globalThis as { document?: Document }).document = {
			createElement: jest.fn().mockImplementation((tag: string) => {
				if (tag === 'div') {
					return wrapper;
				}
				return createdContainer;
			}),
		} as unknown as Document;
		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(cacheManager, 'getPreviewFileHash').mockReturnValue(undefined);
		jest.spyOn(cacheManager, 'setPreviewFileHash').mockImplementation(() => {});
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		jest.spyOn(rootManager, 'register').mockImplementation(() => {});
		(ReactDomClient.createRoot as jest.Mock).mockReturnValue({ render } as any);

		await manager.updatePreview(leaf as any);

		expect(visiblePreviewRoot.appendChild).toHaveBeenCalledWith(wrapper);
		expect(hiddenPreviewRoot.appendChild).not.toHaveBeenCalled();
		expect(render).toHaveBeenCalledTimes(1);
	});

	test('updateAllPreviews skips leaves that already have an active refresh', async () => {
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
			updating: new Set<string>(['Scratchpad.md::1']),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(updatePreviewSpy).not.toHaveBeenCalled();
		expect(plugin.updating.has('Scratchpad.md::1')).toBe(true);
	});

	test('updateAllPreviews bails early while plugin is unloading', async () => {
		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn(),
				},
			},
			updating: new Set<string>(),
			isUnloading: true,
		} as any;

		const manager = new PreviewManager(plugin, {} as any);

		await manager.updateAllPreviews();

		expect(plugin.app.workspace.iterateRootLeaves).not.toHaveBeenCalled();
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
			updating: new Set<string>(),
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
			updating: new Set<string>(),
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

	test('updateAllPreviews still throttles an in-flight leaf after more than one second passes', async () => {
		const nowSpy = jest.spyOn(Date, 'now');
		const sharedPath = 'Slow.md';
		const leaf = {
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
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => cb(leaf)),
				},
			},
			updating: new Set<string>(),
		} as any;

		let release: (() => void) | null = null;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const manager = new PreviewManager(plugin, {} as any);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockImplementation(async () => {
			await gate;
		});

		nowSpy.mockReturnValue(1000);
		const firstCycle = manager.updateAllPreviews();
		await Promise.resolve();

		nowSpy.mockReturnValue(2500);
		await manager.updateAllPreviews();

		expect(updatePreviewSpy).toHaveBeenCalledTimes(1);

		release?.();
		await firstCycle;
		nowSpy.mockRestore();
	});
});

import { PreviewManager } from '@/features/preview/preview-manager';
import { rootManager } from '@/platform/react/root-manager';
import { cacheManager } from '@/platform/cache/cache-manager';
import { CONSTANTS } from '@/config/constants';
import InfluxFile from '@/domain/backlinks/influx-file';
import * as ReactDomClient from 'react-dom/client';
import { MarkdownRenderChild, MarkdownView } from 'obsidian';

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

	const createMarkdownLeaf = (params: {
		path: string;
		containerEl: HTMLDivElement;
		mode?: 'source' | 'preview';
		file?: { path: string; stat?: { mtime: number } };
		previewModeContainerEl?: HTMLElement;
	}) => {
		const view = new MarkdownView({} as any) as any;
		view.mode = params.mode ?? 'preview';
		view.file = params.file ?? { path: params.path };
		view.previewMode = params.previewModeContainerEl ? { containerEl: params.previewModeContainerEl } : {};
		return {
			view,
			containerEl: params.containerEl,
		};
	};

	afterEach(() => {
		jest.useRealTimers();
		jest.clearAllMocks();
		cacheManager.clearAll();
		rootManager.unmountAll();
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
		const leaf = createMarkdownLeaf({
			path: 'Scratchpad.md',
			containerEl,
		});

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

		expect(containerEl.querySelectorAll).toHaveBeenCalled();
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

		test('handlePreviewMode creates a renderer-managed preview host once per preview root', async () => {
		let currentContainer: HTMLElement | null = null;
		const previewRoot = {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (!currentContainer || !selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [];
				}
				return [currentContainer];
			}),
			appendChild: jest.fn((wrapper: { querySelector?: (selector: string) => HTMLElement | null }) => {
				currentContainer = wrapper.querySelector?.(CONSTANTS.INFLUX_CONTAINER_TAG) ?? null;
			}),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const createdWrapper = {
			appendChild: jest.fn(),
			className: '',
			querySelector: jest.fn().mockImplementation(() => createdContainer),
		} as unknown as HTMLElement;
		const createdContainer = { id: '', replaceChildren: jest.fn() } as unknown as HTMLElement;
		const addChild = jest.fn();

		(globalThis as { document?: Document }).document = {
			createElement: jest.fn().mockImplementation((tag: string) => {
				if (tag === 'div') {
					return createdWrapper;
				}
				return createdContainer;
			}),
		} as unknown as Document;

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 1 } }),
		} as any);
		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(InfluxFile, 'create').mockResolvedValue({
			uuid: 'doc-host',
			show: true,
			totalEntryCount: 0,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		} as any);

		await manager.handlePreviewMode(previewRoot, {
			docId: 'doc-1',
			sourcePath: 'Shared.md',
			addChild,
		} as any);
		await manager.handlePreviewMode(previewRoot, {
			docId: 'doc-1',
			sourcePath: 'Shared.md',
			addChild,
		} as any);

		expect(addChild).toHaveBeenCalledTimes(1);
		expect(addChild).toHaveBeenCalledWith(expect.any(MarkdownRenderChild));
		expect(previewRoot.appendChild).toHaveBeenCalledTimes(1);
		expect(createdContainer.id).toBe('influx-preview-host-doc-1');
	});

		test('updatePreview attaches a root to an existing untracked preview container', async () => {
		const existingContainer = { id: 'existing-host', replaceChildren: jest.fn() } as unknown as HTMLElement;
		const previewRoot = {
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [existingContainer];
				}
				return [{ remove: jest.fn(), querySelector: jest.fn().mockReturnValue(existingContainer) }];
			}),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const leaf = createMarkdownLeaf({
			path: 'Reuse.md',
			file: { path: 'Reuse.md', stat: { mtime: 1 } },
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
			} as unknown as HTMLDivElement,
			previewModeContainerEl: previewRoot,
		});
		const influxFile = {
			uuid: 'reuse-uuid',
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
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 1 } }),
		} as any);

		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(cacheManager, 'getPreviewFileHash').mockReturnValue(undefined);
		jest.spyOn(cacheManager, 'setPreviewFileHash').mockImplementation(() => {});
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		jest.spyOn(rootManager, 'get').mockReturnValue(undefined);
		jest.spyOn(rootManager, 'has').mockReturnValue(false);
		const registerSpy = jest.spyOn(rootManager, 'register').mockImplementation(() => {});
		const createRootMock = ReactDomClient.createRoot as jest.Mock;
		const root = { render: jest.fn(), unmount: jest.fn() };
		createRootMock.mockReturnValue(root);

		await manager.updatePreview(leaf as any);

		expect(existingContainer.replaceChildren).toHaveBeenCalledTimes(1);
		expect(createRootMock).toHaveBeenCalledWith(existingContainer);
		expect(registerSpy).toHaveBeenCalledWith(existingContainer, root, 'preview', 'Reuse.md');
		expect(previewRoot.appendChild).not.toHaveBeenCalled();
	});

		test('handlePreviewMode renders directly from the post-processor and avoids repeated leaf refreshes', async () => {
			let currentContainer: HTMLElement | null = null;
			const createdContainer = { id: '', replaceChildren: jest.fn() } as unknown as HTMLElement;
			const createdWrapper = {
				appendChild: jest.fn(),
				className: '',
				querySelector: jest.fn().mockImplementation(() => createdContainer),
			} as unknown as HTMLElement;
			const previewRoot = {
				classList: {
					contains: (name: string) => name === 'markdown-preview-view',
				},
				querySelectorAll: jest.fn().mockImplementation((selector: string) => {
					if (!currentContainer || !selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
						return [];
					}
					return [currentContainer];
				}),
				appendChild: jest.fn((wrapper: { querySelector?: () => HTMLElement | null }) => {
					currentContainer = wrapper.querySelector?.() ?? null;
				}),
				insertBefore: jest.fn(),
				firstChild: null,
			} as unknown as HTMLElement;
			(globalThis as { document?: Document }).document = {
				createElement: jest.fn().mockImplementation((tag: string) => {
					if (tag === 'div') {
						return createdWrapper;
					}
					return createdContainer;
				}),
			} as unknown as Document;

			const plugin = {
				data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
				app: { workspace: { iterateRootLeaves: jest.fn() } },
				updating: new Set<string>(),
			} as any;
			const manager = new PreviewManager(plugin, {
				getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 1 } }),
			} as any);
			const influxFile = {
				uuid: 'shared-uuid',
				show: true,
				totalEntryCount: 0,
				makeInfluxList: jest.fn().mockResolvedValue(undefined),
				toEntries: jest.fn().mockReturnValue([]),
			};
			jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
			jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
			const createRootMock = ReactDomClient.createRoot as jest.Mock;
			createRootMock.mockReturnValue({ render: jest.fn(), unmount: jest.fn() });

			await manager.handlePreviewMode(previewRoot, { docId: 'shared-doc', sourcePath: 'Shared.md', addChild: jest.fn() } as any);
			await manager.handlePreviewMode(previewRoot, { docId: 'shared-doc', sourcePath: 'Shared.md', addChild: jest.fn() } as any);
			await manager.handlePreviewMode(previewRoot, { docId: 'shared-doc', sourcePath: 'Shared.md', addChild: jest.fn() } as any);

			expect(InfluxFile.create).toHaveBeenCalledTimes(1);
			expect(createRootMock).toHaveBeenCalledTimes(1);
			expect(plugin.app.workspace.iterateRootLeaves).not.toHaveBeenCalled();
		});

	test('refreshPreviewLeavesByPath prefers tracked preview roots over root leaf iteration', async () => {
		const trackedContainer = {
			id: 'tracked-preview-root',
			classList: { contains: jest.fn().mockReturnValue(false) },
			closest: jest.fn(),
			querySelector: jest.fn(),
		} as unknown as HTMLElement;
		const previewRoot = {
			id: 'tracked-preview-pane',
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
			remove: jest.fn(),
			closest: jest.fn().mockReturnValue(null),
			querySelector: jest.fn().mockReturnValue(null),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [trackedContainer];
				}
				return [];
			}),
		} as unknown as HTMLElement;
		(trackedContainer.closest as jest.Mock).mockReturnValue(previewRoot);

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 9 } }),
		} as any);
		const root = { render: jest.fn(), unmount: jest.fn() } as any;
		rootManager.register(trackedContainer, root, 'preview', 'Tracked.md');
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);

		await (manager as any).refreshPreviewLeavesByPath('Tracked.md');

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: previewRoot,
			filePath: 'Tracked.md',
			preferredContainerId: 'tracked-preview-root',
		}));
		expect(updatePreviewSpy).not.toHaveBeenCalled();
		expect(plugin.app.workspace.iterateRootLeaves).not.toHaveBeenCalled();
	});

	test('scheduled preview refresh stops retrying after the first successful refresh', async () => {
		jest.useFakeTimers();
		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const refreshSpy = jest.spyOn(manager as any, 'refreshPreviewLeavesByPath')
			.mockResolvedValueOnce(true)
			.mockResolvedValue(false);
		const refreshDelays = (PreviewManager as any).POST_PROCESS_REFRESH_DELAYS_MS as number[];

		(manager as any).schedulePreviewRefreshForPath('Tracked.md');

		for (const delay of refreshDelays) {
			jest.advanceTimersByTime(delay + 1);
			await Promise.resolve();
			await Promise.resolve();
		}

		expect(refreshSpy).toHaveBeenCalledTimes(1);
	});

	test('schedulePreviewRefreshForPath tries an immediate refresh before starting retry timers', async () => {
		jest.useFakeTimers();
		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const refreshSpy = jest.spyOn(manager as any, 'refreshPreviewLeavesByPath').mockResolvedValueOnce(false);
		const scheduleAttemptSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshAttempt').mockImplementation(() => {});

		(manager as any).schedulePreviewRefreshForPath('Immediate.md');
		await Promise.resolve();
		await Promise.resolve();

		expect(refreshSpy).toHaveBeenCalledTimes(1);
		expect(scheduleAttemptSpy).toHaveBeenCalledWith('Immediate.md', 1, 0);
	});

	test('updateAllPreviews refreshes tracked preview roots before falling back to leaf iteration', async () => {
		const trackedContainer = {
			id: 'tracked-preview-root',
			classList: { contains: jest.fn().mockReturnValue(false) },
			closest: jest.fn(),
			querySelector: jest.fn(),
		} as unknown as HTMLElement;
		const trackedPreviewRoot = {
			id: 'tracked-preview-pane',
			classList: { contains: (name: string) => name === 'markdown-preview-view' },
			remove: jest.fn(),
			closest: jest.fn().mockReturnValue(null),
			querySelector: jest.fn().mockReturnValue(null),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [trackedContainer];
				}
				return [];
			}),
		} as unknown as HTMLElement;
		(trackedContainer.closest as jest.Mock).mockReturnValue(trackedPreviewRoot);

		const untrackedLeaf = createMarkdownLeaf({
			path: 'Untracked.md',
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([{ classList: { contains: () => true }, querySelectorAll: jest.fn().mockReturnValue([]) }]),
			} as unknown as HTMLDivElement,
		});

		const iterateRootLeaves = jest.fn((cb: (leaf: unknown) => void) => {
			cb(untrackedLeaf);
		});
		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockImplementation((path: string) => ({ stat: { mtime: path === 'Tracked.md' ? 4 : 2 } })),
		} as any);
		rootManager.register(trackedContainer, { render: jest.fn(), unmount: jest.fn() } as any, 'preview', 'Tracked.md');
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);
		const updatePreviewSpy = jest.spyOn(manager, 'updatePreview').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: trackedPreviewRoot,
			filePath: 'Tracked.md',
			preferredContainerId: 'tracked-preview-root',
		}));
		expect(updatePreviewSpy).toHaveBeenCalledWith(untrackedLeaf);
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


	test('updatePreview drops an in-flight render when dependencies change before completion', async () => {
		const previewRoot = {
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockReturnValue([]),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const leaf = createMarkdownLeaf({
			path: 'Dependency.md',
			file: { path: 'Dependency.md', stat: { mtime: 999 } },
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
			} as unknown as HTMLDivElement,
		});
		const makeInfluxListDeferred = new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
		const influxFile = {
			uuid: 'dependency-uuid',
			show: true,
			totalEntryCount: 3,
			makeInfluxList: jest.fn().mockImplementation(async () => {
				cacheManager.invalidateFile('Changed Source.md');
				await makeInfluxListDeferred;
			}),
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
		const setPreviewFileHashSpy = jest.spyOn(cacheManager, 'setPreviewFileHash').mockImplementation(() => {});
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		jest.spyOn(rootManager, 'register').mockImplementation(() => {});
		(ReactDomClient.createRoot as jest.Mock).mockReturnValue({ render: jest.fn() } as any);

		await manager.updatePreview(leaf as any);

		expect(ReactDomClient.createRoot).not.toHaveBeenCalled();
		expect(setPreviewFileHashSpy).not.toHaveBeenCalled();
	});

	test('updateAllPreviews skips leaves that already have an active refresh', async () => {
		const leaf = createMarkdownLeaf({
			path: 'Scratchpad.md',
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		});

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
		const leafA = createMarkdownLeaf({
			path: sharedPath,
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		});
		const leafB = createMarkdownLeaf({
			path: sharedPath,
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		});

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
		expect(updatePreviewSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual(expect.arrayContaining([leafA, leafB]));
	});

	test('updateAllPreviews throttles while in flight, then allows next cycle after settle', async () => {
		const sharedPath = 'Shared.md';
		const leafA = createMarkdownLeaf({
			path: sharedPath,
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		});
		const leafB = createMarkdownLeaf({
			path: sharedPath,
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		});

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

		let release!: () => void;
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

		await manager.updateAllPreviews();
		expect(updatePreviewSpy).toHaveBeenCalledTimes(2);

		release();
		await firstCycle;

		const doneGate = Promise.resolve();
		updatePreviewSpy.mockImplementation(async () => {
			await doneGate;
		});
		await manager.updateAllPreviews();
		expect(updatePreviewSpy).toHaveBeenCalledTimes(4);
	});

});

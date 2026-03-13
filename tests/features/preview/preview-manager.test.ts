import { PreviewManager } from '@/features/preview/preview-manager';
import { rootManager } from '@/platform/react/root-manager';
import { cacheManager } from '@/platform/cache/cache-manager';
import { CONSTANTS } from '@/config/constants';
import InfluxFile from '@/domain/backlinks/influx-file';
import * as ReactDomClient from 'react-dom/client';
import { MarkdownRenderChild, MarkdownView, requireApiVersion } from 'obsidian';

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

		beforeEach(() => {
			jest.spyOn(console, 'info').mockImplementation(() => {});
			(requireApiVersion as jest.Mock).mockReturnValue(true);
		});

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
		previewModeRerender?: jest.Mock;
		isDeferred?: boolean;
		loadIfDeferred?: jest.Mock;
		viewType?: string;
	}) => {
		const view = new MarkdownView({} as any) as any;
		view.mode = params.mode ?? 'preview';
		view.file = params.file ?? { path: params.path };
		view.previewMode = params.previewModeContainerEl
			? { containerEl: params.previewModeContainerEl, rerender: params.previewModeRerender ?? jest.fn() }
			: { rerender: params.previewModeRerender ?? jest.fn() };
		return {
			view,
			containerEl: params.containerEl,
			isDeferred: params.isDeferred ?? false,
			loadIfDeferred: params.loadIfDeferred ?? jest.fn().mockResolvedValue(undefined),
			getViewState: jest.fn().mockReturnValue({ type: params.viewType ?? 'markdown' }),
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

	test('updateAllPreviews short-circuits into preview cleanup when sidebar mode is enabled', async () => {
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

	test('handlePreviewMode coalesces concurrent post-processor renders for the same document host', async () => {
		let currentContainer: HTMLElement | null = null;
		let releaseRender!: () => void;
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
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockImplementation(
			() => new Promise<void>((resolve) => {
				releaseRender = resolve;
			})
		);

		const context = {
			docId: 'doc-1',
			sourcePath: 'Shared.md',
			addChild: jest.fn(),
		} as any;

		const first = manager.handlePreviewMode(previewRoot, context);
		const second = manager.handlePreviewMode(previewRoot, context);
		const third = manager.handlePreviewMode(previewRoot, context);

		expect(renderPreviewSpy).toHaveBeenCalledTimes(1);

		releaseRender();
		await Promise.all([first, second, third]);
	});

	test('handlePreviewMode ignores nested markdown rendered inside an Influx markdown mount', async () => {
		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 1 } }),
		} as any);
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);
		const scheduleRefreshSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshForPath').mockImplementation(() => {});
		const nestedRoot = { matches: jest.fn() } as unknown as Element;
		const element = {
			closest: jest.fn().mockImplementation((selector: string) => {
				if (selector === '[data-influx-markdown-mount-root="true"]') {
					return nestedRoot;
				}
				return null;
			}),
		} as unknown as HTMLElement;

		await manager.handlePreviewMode(element, {
			docId: 'nested-doc',
			sourcePath: 'Nested.md',
			addChild: jest.fn(),
		} as any);

		expect(renderPreviewSpy).not.toHaveBeenCalled();
		expect(scheduleRefreshSpy).not.toHaveBeenCalled();
	});

	test('handlePreviewMode recreates a renderer-owned host after markdown child unload', async () => {
		let currentContainer: HTMLElement | null = null;
		const createdContainer = {
			id: '',
			replaceChildren: jest.fn(),
			closest: jest.fn(),
			remove: jest.fn(),
		} as unknown as HTMLElement;
		const createdWrapper = {
			appendChild: jest.fn(),
			className: '',
			querySelector: jest.fn().mockImplementation(() => createdContainer),
			remove: jest.fn().mockImplementation(() => {
				currentContainer = null;
			}),
		} as unknown as HTMLElement;
		(createdContainer.closest as jest.Mock).mockReturnValue(createdWrapper);
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
		const unmountSpy = jest.spyOn(rootManager, 'unmountDeferred').mockImplementation(() => {});
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

		const child = addChild.mock.calls[0]?.[0] as MarkdownRenderChild;
		child.unload();

		await manager.handlePreviewMode(previewRoot, {
			docId: 'doc-1',
			sourcePath: 'Shared.md',
			addChild,
		} as any);

		expect(unmountSpy).toHaveBeenCalledWith(createdContainer);
		expect(createdWrapper.remove).toHaveBeenCalledTimes(1);
		expect(addChild).toHaveBeenCalledTimes(2);
		expect(previewRoot.appendChild).toHaveBeenCalledTimes(2);
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

	test('updateAllPreviews refreshes a live post-processor host even before a preview root is tracked', async () => {
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
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);

		await manager.handlePreviewMode(previewRoot, {
			docId: 'untracked-doc',
			sourcePath: 'Untracked.md',
			addChild: jest.fn(),
		} as any);
		renderPreviewSpy.mockClear();

		await manager.updateAllPreviews();

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: previewRoot,
			existingContainer: createdContainer,
			filePath: 'Untracked.md',
			preferredContainerId: 'influx-preview-host-untracked-doc',
		}));
	});

	test('renderPreviewForContainer refreshes a stale pane even when another pane for the same file already has a fresh hash', async () => {
		const previewRootA = { querySelectorAll: jest.fn().mockReturnValue([]) } as unknown as HTMLElement;
		const previewRootB = { querySelectorAll: jest.fn().mockReturnValue([]) } as unknown as HTMLElement;
		const containerA = { id: 'pane-a', replaceChildren: jest.fn() } as unknown as HTMLElement;
		const containerB = { id: 'pane-b', replaceChildren: jest.fn() } as unknown as HTMLElement;
		const rootA = { render: jest.fn(), unmount: jest.fn() } as any;
		const rootB = { render: jest.fn(), unmount: jest.fn() } as any;
		const dependencyRevision = cacheManager.getDependencyRevision();
		const fileHash = `Shared.md-1-settings-hash-${dependencyRevision}`;

		rootManager.register(containerA, rootA, 'preview', 'Shared.md', {
			previewRoot: previewRootA,
			previewHash: fileHash,
		});
		rootManager.register(containerB, rootB, 'preview', 'Shared.md', {
			previewRoot: previewRootB,
			previewHash: 'stale-hash',
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const influxFile = {
			uuid: 'shared-uuid',
			show: true,
			totalEntryCount: 0,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};

		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(cacheManager, 'getPreviewFileHash').mockReturnValue(fileHash);
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		jest.spyOn(rootManager, 'unmount').mockImplementation(() => {});

		await (manager as any).renderPreviewForContainer({
			previewDiv: previewRootB,
			existingContainer: containerB,
			filePath: 'Shared.md',
			fileMtime: 1,
			preferredContainerId: 'pane-b',
		});

		expect(rootA.render).not.toHaveBeenCalled();
		expect(rootB.render).toHaveBeenCalledTimes(1);
		expect(rootManager.get(containerB)?.metadata?.previewHash).toBe(fileHash);
	});

	test('renderPreviewForContainer does not mark a preview fresh before render succeeds', async () => {
		const previewRoot = { querySelectorAll: jest.fn().mockReturnValue([]) } as unknown as HTMLElement;
		const container = { id: 'throwing-pane', replaceChildren: jest.fn() } as unknown as HTMLElement;
		const root = {
			render: jest.fn(() => {
				throw new Error('render fail');
			}),
			unmount: jest.fn(),
		} as any;

		rootManager.register(container, root, 'preview', 'Throw.md', { previewRoot });

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const influxFile = {
			uuid: 'throwing-uuid',
			show: true,
			totalEntryCount: 0,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};
		const setPreviewFileHashSpy = jest.spyOn(cacheManager, 'setPreviewFileHash').mockImplementation(() => {});

		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		jest.spyOn(rootManager, 'unmount').mockImplementation(() => {});

		await expect((manager as any).renderPreviewForContainer({
			previewDiv: previewRoot,
			existingContainer: container,
			filePath: 'Throw.md',
			fileMtime: 1,
			preferredContainerId: 'throwing-pane',
		})).rejects.toThrow('render fail');

		expect(setPreviewFileHashSpy).not.toHaveBeenCalled();
		expect(rootManager.get(container)?.metadata?.previewHash).toBeUndefined();
	});

	test('updatePreview rerenders preview mode instead of injecting a fallback host when none exists', async () => {
		const previewRoot = {
			id: 'rerender-preview-root',
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockReturnValue([]),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const previewModeRerender = jest.fn();
		const leaf = createMarkdownLeaf({
			path: 'Rerender.md',
			file: { path: 'Rerender.md', stat: { mtime: 1 } },
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: previewRoot,
			previewModeRerender,
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const scheduleRefreshSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshForPath').mockImplementation(() => {});

		await manager.updatePreview(leaf as any);

		expect(previewModeRerender).toHaveBeenCalledWith(true);
		expect(scheduleRefreshSpy).toHaveBeenCalledWith('Rerender.md');
		expect(previewRoot.appendChild).not.toHaveBeenCalled();
	});

	test('updatePreview rerenders preview mode instead of adopting an untracked preview container', async () => {
		const existingContainer = {
			id: 'untracked-preview-host',
			replaceChildren: jest.fn(),
		} as unknown as HTMLElement;
		const previewRoot = {
			id: 'rerender-preview-root',
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [existingContainer];
				}
				return [];
			}),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const previewModeRerender = jest.fn();
		const leaf = createMarkdownLeaf({
			path: 'UntrackedContainer.md',
			file: { path: 'UntrackedContainer.md', stat: { mtime: 1 } },
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: previewRoot,
			previewModeRerender,
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const scheduleRefreshSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshForPath').mockImplementation(() => {});
		const createRootMock = ReactDomClient.createRoot as jest.Mock;

		await manager.updatePreview(leaf as any);

		expect(previewModeRerender).toHaveBeenCalledWith(true);
		expect(scheduleRefreshSpy).toHaveBeenCalledWith('UntrackedContainer.md');
		expect(createRootMock).not.toHaveBeenCalled();
		expect(existingContainer.replaceChildren).not.toHaveBeenCalled();
	});

	test('updatePreview refreshes a tracked preview host from root metadata without rediscovering container DOM', async () => {
		const previewRoot = {
			id: 'tracked-preview-root',
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockReturnValue([]),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const trackedContainer = {
			id: 'tracked-preview-host',
			replaceChildren: jest.fn(),
			closest: jest.fn().mockReturnValue(null),
			querySelector: jest.fn(),
		} as unknown as HTMLElement;
		const leaf = createMarkdownLeaf({
			path: 'Tracked.md',
			file: { path: 'Tracked.md', stat: { mtime: 1 } },
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: previewRoot,
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		rootManager.register(trackedContainer, { render: jest.fn(), unmount: jest.fn() } as any, 'preview', 'Tracked.md', { previewRoot });
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);
		const scheduleRefreshSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshForPath').mockImplementation(() => {});

		await manager.updatePreview(leaf as any);

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: previewRoot,
			existingContainer: trackedContainer,
			filePath: 'Tracked.md',
		}));
		expect(scheduleRefreshSpy).not.toHaveBeenCalled();
		expect(previewRoot.querySelectorAll).not.toHaveBeenCalled();
	});

		test('updatePreview caches preview root metadata after recovering a tracked host from DOM fallback', async () => {
			const trackedContainer = {
				id: 'tracked-preview-host',
				replaceChildren: jest.fn(),
				classList: { contains: jest.fn().mockReturnValue(false) },
				closest: jest.fn().mockReturnValue(null),
				querySelector: jest.fn(),
			} as unknown as HTMLElement;
		const previewRoot = {
			id: 'tracked-preview-root',
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockImplementation((selector: string) => {
				if (selector.includes(CONSTANTS.INFLUX_CONTAINER_TAG)) {
					return [trackedContainer];
				}
				return [];
			}),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const leaf = createMarkdownLeaf({
			path: 'Tracked.md',
			file: { path: 'Tracked.md', stat: { mtime: 1 } },
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: previewRoot,
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		rootManager.register(trackedContainer, { render: jest.fn(), unmount: jest.fn() } as any, 'preview', 'Tracked.md');
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);

		await manager.updatePreview(leaf as any);

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: previewRoot,
			existingContainer: trackedContainer,
			filePath: 'Tracked.md',
		}));
		expect(rootManager.get(trackedContainer)?.metadata?.previewRoot).toBe(previewRoot);
	});

	test('refreshPreviewLeavesByPath refreshes tracked preview roots without falling back to leaf updates when none remain', async () => {
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
		(trackedContainer.closest as jest.Mock).mockReturnValue(null);

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 9 } }),
		} as any);
		const root = { render: jest.fn(), unmount: jest.fn() } as any;
		rootManager.register(trackedContainer, root, 'preview', 'Tracked.md', { previewRoot });
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);
		const refreshUntrackedLeafSpy = jest.spyOn(manager as any, 'refreshUntrackedPreviewLeaf').mockResolvedValue(undefined);

		await (manager as any).refreshPreviewLeavesByPath('Tracked.md');

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: previewRoot,
			filePath: 'Tracked.md',
			preferredContainerId: 'tracked-preview-root',
		}));
		expect(refreshUntrackedLeafSpy).not.toHaveBeenCalled();
		expect(plugin.app.workspace.iterateRootLeaves).not.toHaveBeenCalled();
	});

		test('refreshPreviewLeavesByPath also refreshes untracked leaves for the same file path', async () => {
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
		(trackedContainer.closest as jest.Mock).mockReturnValue(null);

		const previewModeRerender = jest.fn();
		const untrackedLeaf = createMarkdownLeaf({
			path: 'Shared.md',
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([{ classList: { contains: () => true }, querySelectorAll: jest.fn().mockReturnValue([]) }]),
			} as unknown as HTMLDivElement,
			previewModeRerender,
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => cb(untrackedLeaf)),
				},
			},
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 9 } }),
		} as any);
		rootManager.register(trackedContainer, { render: jest.fn(), unmount: jest.fn() } as any, 'preview', 'Shared.md', { previewRoot: trackedPreviewRoot });
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);
		const scheduleRefreshSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshForPath').mockImplementation(() => {});

		await (manager as any).refreshPreviewLeavesByPath('Shared.md');

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: trackedPreviewRoot,
			filePath: 'Shared.md',
			preferredContainerId: 'tracked-preview-root',
		}));
		expect(previewModeRerender).not.toHaveBeenCalled();
		expect(scheduleRefreshSpy).not.toHaveBeenCalled();
	});

	test('refreshPreviewLeavesByPath loads deferred markdown leaves before inspecting preview state', async () => {
		const previewRoot = {
			id: 'deferred-preview-root',
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockReturnValue([]),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const loadIfDeferred = jest.fn().mockResolvedValue(undefined);
		const deferredLeaf = createMarkdownLeaf({
			path: 'Deferred.md',
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: previewRoot,
			isDeferred: true,
			loadIfDeferred,
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => cb(deferredLeaf)),
				},
			},
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const refreshUntrackedLeafSpy = jest.spyOn(manager as any, 'refreshUntrackedPreviewLeaf').mockResolvedValue(undefined);

		await (manager as any).refreshPreviewLeavesByPath('Deferred.md');

		expect(loadIfDeferred).toHaveBeenCalledTimes(1);
		expect(refreshUntrackedLeafSpy).toHaveBeenCalledWith(deferredLeaf, 'Deferred.md');
	});

	test('updateAllPreviews skips deferred markdown leaves during global refreshes', async () => {
		const deferredLeaf = createMarkdownLeaf({
			path: 'Deferred.md',
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: {
				id: 'deferred-preview-root',
				remove: jest.fn(),
				querySelectorAll: jest.fn().mockReturnValue([]),
				appendChild: jest.fn(),
				insertBefore: jest.fn(),
				firstChild: null,
			} as unknown as HTMLElement,
			isDeferred: true,
			loadIfDeferred: jest.fn().mockResolvedValue(undefined),
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => cb(deferredLeaf)),
				},
			},
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const refreshUntrackedLeafSpy = jest.spyOn(manager as any, 'refreshUntrackedPreviewLeaf').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(deferredLeaf.loadIfDeferred).not.toHaveBeenCalled();
		expect(refreshUntrackedLeafSpy).not.toHaveBeenCalled();
	});

	test('refreshPreviewLeavesByPath does not call deferred-view APIs before Obsidian 1.7.2', async () => {
		(requireApiVersion as jest.Mock).mockReturnValue(false);
		const deferredLeaf = createMarkdownLeaf({
			path: 'Deferred.md',
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: {
				id: 'deferred-preview-root',
				remove: jest.fn(),
				querySelectorAll: jest.fn().mockReturnValue([]),
				appendChild: jest.fn(),
				insertBefore: jest.fn(),
				firstChild: null,
			} as unknown as HTMLElement,
			isDeferred: true,
			loadIfDeferred: jest.fn().mockResolvedValue(undefined),
		});

		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: {
				workspace: {
					iterateRootLeaves: jest.fn((cb: (leaf: unknown) => void) => cb(deferredLeaf)),
				},
			},
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const refreshUntrackedLeafSpy = jest.spyOn(manager as any, 'refreshUntrackedPreviewLeaf').mockResolvedValue(undefined);

		await (manager as any).refreshPreviewLeavesByPath('Deferred.md');

		expect(deferredLeaf.loadIfDeferred).not.toHaveBeenCalled();
		expect(refreshUntrackedLeafSpy).toHaveBeenCalledWith(deferredLeaf, 'Deferred.md');
	});

	test('schedulePreviewRefreshForPath coalesces duplicate refresh requests into one deferred pass', async () => {
		jest.useFakeTimers();
		const plugin = {
			data: { settings: { showInfluxInSidebar: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const refreshSpy = jest.spyOn(manager as any, 'refreshPreviewLeavesByPath').mockResolvedValue(false);

		(manager as any).schedulePreviewRefreshForPath('Immediate.md');
		(manager as any).schedulePreviewRefreshForPath('Immediate.md');
		jest.runAllTimers();
		await Promise.resolve();

		expect(refreshSpy).toHaveBeenCalledTimes(1);
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
		(trackedContainer.closest as jest.Mock).mockReturnValue(null);

		const previewModeRerender = jest.fn();
		const untrackedLeaf = createMarkdownLeaf({
			path: 'Untracked.md',
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([{ classList: { contains: () => true }, querySelectorAll: jest.fn().mockReturnValue([]) }]),
			} as unknown as HTMLDivElement,
			previewModeRerender,
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
		rootManager.register(trackedContainer, { render: jest.fn(), unmount: jest.fn() } as any, 'preview', 'Tracked.md', { previewRoot: trackedPreviewRoot });
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer').mockResolvedValue(undefined);
		const scheduleRefreshSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshForPath').mockImplementation(() => {});

		await manager.updateAllPreviews();

		expect(renderPreviewSpy).toHaveBeenCalledWith(expect.objectContaining({
			previewDiv: trackedPreviewRoot,
			filePath: 'Tracked.md',
			preferredContainerId: 'tracked-preview-root',
		}));
		expect(previewModeRerender).toHaveBeenCalledWith(true);
		expect(scheduleRefreshSpy).toHaveBeenCalledWith('Untracked.md');
	});

	test('handlePreviewMode bails early while plugin is unloading', async () => {
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
		const scheduleRefreshSpy = jest.spyOn(manager as any, 'schedulePreviewRefreshForPath').mockImplementation(() => {});
		const renderPreviewSpy = jest.spyOn(manager as any, 'renderPreviewForContainer');

		await manager.handlePreviewMode(previewRoot, { docId: 'unload-doc', sourcePath: 'Unload.md', addChild: jest.fn() } as any);

		expect(scheduleRefreshSpy).not.toHaveBeenCalled();
		expect(renderPreviewSpy).not.toHaveBeenCalled();
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

	test('renderPreviewForContainer reuses an existing tracked root instead of unmounting and recreating it', async () => {
		const previewRoot = { querySelectorAll: jest.fn().mockReturnValue([]) } as unknown as HTMLElement;
		const container = { id: 'existing-pane', replaceChildren: jest.fn() } as unknown as HTMLElement;
		const root = { render: jest.fn(), unmount: jest.fn() } as any;

		rootManager.register(container, root, 'preview', 'Reuse.md', { previewRoot });

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const influxFile = {
			uuid: 'reuse-uuid',
			show: true,
			totalEntryCount: 0,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};

		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		const createRootSpy = jest.spyOn(ReactDomClient, 'createRoot');
		const unmountSpy = jest.spyOn(rootManager, 'unmount');

		await (manager as any).renderPreviewForContainer({
			previewDiv: previewRoot,
			existingContainer: container,
			filePath: 'Reuse.md',
			fileMtime: 1,
			preferredContainerId: 'existing-pane',
		});

		expect(unmountSpy).not.toHaveBeenCalled();
		expect(createRootSpy).not.toHaveBeenCalled();
		expect(root.render).toHaveBeenCalledTimes(1);
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
		const refreshUntrackedLeafSpy = jest.spyOn(manager as any, 'refreshUntrackedPreviewLeaf').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(refreshUntrackedLeafSpy).not.toHaveBeenCalled();
		expect(plugin.updating.has('Scratchpad.md::1')).toBe(true);
	});

	test('updateAllPreviews ignores source-mode leaves even if preview markup still exists in the container', async () => {
		const previewRoot = {
			classList: { contains: (name: string) => name === 'markdown-preview-view' },
			querySelectorAll: jest.fn().mockReturnValue([]),
		} as unknown as HTMLElement;
		const leaf = createMarkdownLeaf({
			path: 'SourceOnly.md',
			mode: 'source',
			containerEl: {
				querySelectorAll: jest.fn().mockReturnValue([previewRoot]),
			} as unknown as HTMLDivElement,
			previewModeContainerEl: previewRoot,
		});

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
		const refreshUntrackedLeafSpy = jest.spyOn(manager as any, 'refreshUntrackedPreviewLeaf').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(refreshUntrackedLeafSpy).not.toHaveBeenCalled();
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
		const refreshUntrackedLeafSpy = jest.spyOn(manager as any, 'refreshUntrackedPreviewLeaf').mockResolvedValue(undefined);

		await manager.updateAllPreviews();

		expect(refreshUntrackedLeafSpy).toHaveBeenCalledTimes(2);
		expect(refreshUntrackedLeafSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual(expect.arrayContaining([leafA, leafB]));
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
		const refreshUntrackedLeafSpy = jest
			.spyOn(manager as any, 'refreshUntrackedPreviewLeaf')
			.mockImplementation(async () => {
				await gate;
			});

		const firstCycle = manager.updateAllPreviews();
		await Promise.resolve();

		await manager.updateAllPreviews();
		expect(refreshUntrackedLeafSpy).toHaveBeenCalledTimes(2);

		release();
		await firstCycle;

		const doneGate = Promise.resolve();
		refreshUntrackedLeafSpy.mockImplementation(async () => {
			await doneGate;
		});
		await manager.updateAllPreviews();
		expect(refreshUntrackedLeafSpy).toHaveBeenCalledTimes(4);
	});

});

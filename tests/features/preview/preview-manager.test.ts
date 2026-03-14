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
		const createSpy = jest.spyOn(InfluxFile, 'create').mockResolvedValue({
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
		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		const createSpy = jest.spyOn(InfluxFile, 'create').mockResolvedValue({
			uuid: 'doc-host',
			show: true,
			totalEntryCount: 0,
			makeInfluxList: jest.fn().mockImplementation(() => new Promise<void>((resolve) => {
				releaseRender = resolve;
			})),
			toEntries: jest.fn().mockReturnValue([]),
		} as any);

		const context = {
			docId: 'doc-1',
			sourcePath: 'Shared.md',
			addChild: jest.fn(),
		} as any;

		const first = manager.handlePreviewMode(previewRoot, context);
		const second = manager.handlePreviewMode(previewRoot, context);
		const third = manager.handlePreviewMode(previewRoot, context);

		await Promise.resolve();
		expect(createSpy).toHaveBeenCalledTimes(1);

		releaseRender();
		await Promise.all([first, second, third]);
	});

	test('handlePreviewMode recreates the post-processor host when the preview root changes for the same document', async () => {
		const previewRootA = {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
			querySelectorAll: jest.fn().mockReturnValue([]),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const previewRootB = {
			classList: {
				contains: (name: string) => name === 'markdown-preview-view',
			},
			querySelectorAll: jest.fn().mockReturnValue([]),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const wrapperA = { remove: jest.fn() };
		const containerA = {
			id: 'host-a',
			replaceChildren: jest.fn(),
			closest: jest.fn().mockReturnValue(wrapperA),
			remove: jest.fn(),
		} as unknown as HTMLElement;
		const containerB = {
			id: 'host-b',
			replaceChildren: jest.fn(),
			closest: jest.fn().mockReturnValue(null),
			remove: jest.fn(),
		} as unknown as HTMLElement;

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {
			getFileByPath: jest.fn().mockReturnValue({ stat: { mtime: 1 } }),
		} as any);
		const unmountSpy = jest.spyOn(rootManager, 'unmountDeferred').mockImplementation(() => {});
		const addChild = jest.fn();
		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(InfluxFile, 'create')
			.mockResolvedValueOnce({
				uuid: 'doc-host-a',
				show: true,
				totalEntryCount: 0,
				makeInfluxList: jest.fn().mockResolvedValue(undefined),
				toEntries: jest.fn().mockReturnValue([]),
			} as any)
			.mockResolvedValueOnce({
				uuid: 'doc-host-b',
				show: true,
				totalEntryCount: 0,
				makeInfluxList: jest.fn().mockResolvedValue(undefined),
				toEntries: jest.fn().mockReturnValue([]),
			} as any);
		(globalThis as { document?: Document }).document = {
			createElement: jest.fn()
				.mockImplementationOnce(() => ({
					appendChild: jest.fn(),
					className: '',
					querySelector: jest.fn().mockImplementation(() => containerA),
				}))
				.mockImplementationOnce(() => containerA)
				.mockImplementationOnce(() => ({
					appendChild: jest.fn(),
					className: '',
					querySelector: jest.fn().mockImplementation(() => containerB),
				}))
				.mockImplementationOnce(() => containerB),
		} as unknown as Document;

		await manager.handlePreviewMode(previewRootA, {
			docId: 'doc-1',
			sourcePath: 'Shared.md',
			addChild,
		} as any);

		await manager.handlePreviewMode(previewRootB, {
			docId: 'doc-1',
			sourcePath: 'Shared.md',
			addChild,
		} as any);

		expect(previewRootA.appendChild).toHaveBeenCalledTimes(1);
		expect(previewRootB.appendChild).toHaveBeenCalledTimes(1);
		expect(InfluxFile.create).toHaveBeenCalledTimes(2);
		expect(unmountSpy).toHaveBeenCalledWith(containerA);
		expect(wrapperA.remove).toHaveBeenCalledTimes(1);
		expect(addChild).toHaveBeenCalledTimes(2);
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
		const createSpy = jest.spyOn(InfluxFile, 'create');
		const addChild = jest.fn();
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
			addChild,
		} as any);

		expect(createSpy).not.toHaveBeenCalled();
		expect(addChild).not.toHaveBeenCalled();
		expect(ReactDomClient.createRoot).not.toHaveBeenCalled();
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

		await manager.updatePreview(leaf as any);

		expect(previewModeRerender).toHaveBeenCalledWith(true);
		expect(ReactDomClient.createRoot).not.toHaveBeenCalled();
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
		const createRootMock = ReactDomClient.createRoot as jest.Mock;

		await manager.updatePreview(leaf as any);

		expect(previewModeRerender).toHaveBeenCalledWith(true);
		expect(createRootMock).not.toHaveBeenCalled();
		expect(existingContainer.replaceChildren).not.toHaveBeenCalled();
	});


	test('updatePreviewsForFilePath loads deferred markdown leaves before rerendering them', async () => {
		const previewRoot = {
			id: 'deferred-preview-root',
			remove: jest.fn(),
			querySelectorAll: jest.fn().mockReturnValue([]),
			appendChild: jest.fn(),
			insertBefore: jest.fn(),
			firstChild: null,
		} as unknown as HTMLElement;
		const loadIfDeferred = jest.fn().mockResolvedValue(undefined);
		const previewModeRerender = jest.fn();
		const deferredLeaf = createMarkdownLeaf({
			path: 'Deferred.md',
			containerEl: {} as HTMLDivElement,
			previewModeContainerEl: previewRoot,
			previewModeRerender,
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

		await manager.updatePreviewsForFilePath('Deferred.md');

		expect(loadIfDeferred).toHaveBeenCalledTimes(1);
		expect(previewModeRerender).toHaveBeenCalledWith(true);
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
		const previewModeRerender = deferredLeaf.view.previewMode.rerender as jest.Mock;

		await manager.updateAllPreviews();

		expect(deferredLeaf.loadIfDeferred).not.toHaveBeenCalled();
		expect(previewModeRerender).not.toHaveBeenCalled();
	});

	test('updatePreviewsForFilePath does not call deferred-view APIs before Obsidian 1.7.2', async () => {
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
			previewModeRerender: jest.fn(),
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

		await manager.updatePreviewsForFilePath('Deferred.md');

		expect(deferredLeaf.loadIfDeferred).not.toHaveBeenCalled();
		expect((deferredLeaf.view.previewMode.rerender as jest.Mock)).toHaveBeenCalledWith(true);
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
		const trackedRoot = { render: jest.fn(), unmount: jest.fn() } as any;
		rootManager.register(trackedContainer, trackedRoot, 'preview', 'Tracked.md', { previewRoot: trackedPreviewRoot });
		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(InfluxFile, 'create').mockResolvedValue({
			uuid: 'tracked-preview',
			show: true,
			totalEntryCount: 0,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		} as any);

		await manager.updateAllPreviews();

		expect(trackedRoot.render).toHaveBeenCalledTimes(1);
		expect(previewModeRerender).toHaveBeenCalledWith(true);
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
		const createSpy = jest.spyOn(InfluxFile, 'create');
		const addChild = jest.fn();

		await manager.handlePreviewMode(previewRoot, { docId: 'unload-doc', sourcePath: 'Unload.md', addChild } as any);

		expect(createSpy).not.toHaveBeenCalled();
		expect(addChild).not.toHaveBeenCalled();
		expect(ReactDomClient.createRoot).not.toHaveBeenCalled();
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
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);
		jest.spyOn(rootManager, 'register').mockImplementation(() => {});
		(ReactDomClient.createRoot as jest.Mock).mockReturnValue({ render: jest.fn() } as any);

		await manager.updatePreview(leaf as any);

		expect(ReactDomClient.createRoot).not.toHaveBeenCalled();
		expect(rootManager.size).toBe(0);
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

	test('renderPreviewForContainer ignores an older tracked-host refresh that resolves after a newer one', async () => {
		const previewRoot = { querySelectorAll: jest.fn().mockReturnValue([]) } as unknown as HTMLElement;
		const container = { id: 'race-pane', replaceChildren: jest.fn() } as unknown as HTMLElement;
		const root = { render: jest.fn(), unmount: jest.fn() } as any;
		let releaseFirstRender!: () => void;

		rootManager.register(container, root, 'preview', 'Race.md', { previewRoot });

		const plugin = {
			data: { settings: { showInfluxInSidebar: false, influxAtTopOfPage: false } },
			app: { workspace: { iterateRootLeaves: jest.fn() } },
			updating: new Set<string>(),
		} as any;
		const manager = new PreviewManager(plugin, {} as any);
		const firstInfluxFile = {
			uuid: 'old-render',
			show: true,
			totalEntryCount: 1,
			makeInfluxList: jest.fn().mockImplementation(() => new Promise<void>((resolve) => {
				releaseFirstRender = resolve;
			})),
			toEntries: jest.fn().mockReturnValue([]),
		};
		const secondInfluxFile = {
			uuid: 'new-render',
			show: true,
			totalEntryCount: 1,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};

		jest.spyOn(cacheManager, 'getSettingsHash').mockReturnValue('settings-hash');
		jest.spyOn(InfluxFile, 'create')
			.mockResolvedValueOnce(firstInfluxFile as any)
			.mockResolvedValueOnce(secondInfluxFile as any);

		const first = (manager as any).renderPreviewForContainer({
			previewDiv: previewRoot,
			existingContainer: container,
			filePath: 'Race.md',
			fileMtime: 1,
			preferredContainerId: 'race-pane',
		});
		await Promise.resolve();

		await (manager as any).renderPreviewForContainer({
			previewDiv: previewRoot,
			existingContainer: container,
			filePath: 'Race.md',
			fileMtime: 1,
			preferredContainerId: 'race-pane',
		});

		expect(root.render).toHaveBeenCalledTimes(1);

		releaseFirstRender();
		await first;

		expect(root.render).toHaveBeenCalledTimes(1);
	});

	test('updateAllPreviews skips leaves that already have an active refresh', async () => {
		const leaf = createMarkdownLeaf({
			path: 'Scratchpad.md',
			previewModeRerender: jest.fn(),
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
			updating: new Set<string>(),
		} as any;
		const api = {} as any;
		const manager = new PreviewManager(plugin, api);
		plugin.updating.add((manager as any).getLeafUpdateKey(leaf, 'Scratchpad.md'));

		await manager.updateAllPreviews();

		expect((leaf.view.previewMode.rerender as jest.Mock)).not.toHaveBeenCalled();
		expect(plugin.updating.size).toBe(1);
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
			previewModeRerender: jest.fn(),
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

		await manager.updateAllPreviews();

		expect((leaf.view.previewMode.rerender as jest.Mock)).not.toHaveBeenCalled();
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
		const rerenderA = jest.fn();
		const leafA = createMarkdownLeaf({
			path: sharedPath,
			previewModeRerender: rerenderA,
			containerEl: {
				querySelector: jest.fn(),
			} as unknown as HTMLDivElement,
		});
		const rerenderB = jest.fn();
		const leafB = createMarkdownLeaf({
			path: sharedPath,
			previewModeRerender: rerenderB,
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

		await manager.updateAllPreviews();

		expect(rerenderA).toHaveBeenCalledWith(true);
		expect(rerenderB).toHaveBeenCalledWith(true);
	});


});

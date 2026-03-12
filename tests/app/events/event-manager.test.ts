import { MarkdownView, TAbstractFile } from 'obsidian';
import { EventManager } from '@/app/events/event-manager';
import { mockTFile } from '../../mocks';
import { recordMetric } from '@/platform/diagnostics/metrics';

jest.mock('@/platform/diagnostics/metrics', () => ({
    recordMetric: jest.fn(),
}));

describe('EventManager', () => {
	let eventManager: EventManager;
	let plugin: any;
	let vaultHandlers: Map<string, (...args: unknown[]) => void>;
	let workspaceHandlers: Map<string, (...args: unknown[]) => void>;
	const emitVaultEvent = (eventName: string, ...args: unknown[]) => {
		const handler = vaultHandlers.get(eventName);
		expect(handler).toBeDefined();
		handler?.(...args);
	};
	const emitWorkspaceEvent = (eventName: string, ...args: unknown[]) => {
		const handler = workspaceHandlers.get(eventName);
		expect(handler).toBeDefined();
		handler?.(...args);
	};

	const createMarkdownLeaf = (params?: {
		mode?: 'source' | 'preview';
		file?: unknown;
	}) => {
		const view = new MarkdownView({} as any) as MarkdownView & {
			mode: 'source' | 'preview';
			file: unknown;
		};
		view.mode = params?.mode ?? 'source';
		view.file = params?.file as any;
		return { view };
	};

    beforeEach(() => {
		vaultHandlers = new Map();
		workspaceHandlers = new Map();
        plugin = {
            app: {
				vault: {
					on: jest.fn((eventName: string, handler: (...args: unknown[]) => void) => {
						vaultHandlers.set(eventName, handler);
						return { eventName, handler };
					}),
				},
				workspace: {
					on: jest.fn((eventName: string, handler: (...args: unknown[]) => void) => {
						workspaceHandlers.set(eventName, handler);
						return { eventName, handler };
					}),
				},
            },
            data: { settings: { liveUpdate: true } },
            api: { invalidateFileCache: jest.fn() },
            cleanupFileHash: jest.fn(),
            cleanupReactRoots: jest.fn(),
            triggerUpdates: jest.fn(),
            registerEvent: jest.fn(),
        };
        eventManager = new EventManager(plugin);
        (recordMetric as jest.Mock).mockClear();
    });

    describe('register', () => {
        test('registers all expected vault/workspace handlers', () => {
            eventManager.register();

			expect(Array.from(vaultHandlers.keys())).toEqual(['modify', 'rename', 'delete']);
			expect(Array.from(workspaceHandlers.keys())).toEqual(['file-open', 'layout-change', 'active-leaf-change']);
            expect(plugin.registerEvent).toHaveBeenCalledTimes(6);
        });
    });

    describe('file event handlers', () => {
        test('handleModify: ignores folders, invalidates file cache, and respects liveUpdate flag', () => {
			eventManager.register();
            const folder = {} as TAbstractFile;
            const file = mockTFile('test.md', 'test');

			emitVaultEvent('modify', folder);
            expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();

            plugin.data.settings.liveUpdate = false;
			emitVaultEvent('modify', file);
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('test.md');
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();

            plugin.data.settings.liveUpdate = true;
			emitVaultEvent('modify', file);
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('modify', file);
        });

        test('handleRename: invalidates old/new paths for files and always triggers rename update', () => {
			eventManager.register();
            const file = mockTFile('new.md', 'new');
            const folder = {} as TAbstractFile;

			emitVaultEvent('rename', file, 'old.md');
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('old.md');
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('new.md');
            expect(plugin.cleanupFileHash).toHaveBeenCalledWith('old.md');
            expect(plugin.cleanupFileHash).toHaveBeenCalledWith('new.md');
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('rename', file, 'old.md');

            plugin.api.invalidateFileCache.mockClear();
            plugin.cleanupFileHash.mockClear();
            plugin.triggerUpdates.mockClear();

			emitVaultEvent('rename', folder);
            expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
            expect(plugin.cleanupFileHash).not.toHaveBeenCalled();
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('rename', folder, undefined);
        });

        test('handleDelete: invalidates/cleans files and always triggers delete update', () => {
			eventManager.register();
            const file = mockTFile('test.md', 'test');
            const folder = {} as TAbstractFile;

			emitVaultEvent('delete', file);
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('test.md');
            expect(plugin.cleanupFileHash).toHaveBeenCalledWith('test.md');
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('delete', file);

            plugin.api.invalidateFileCache.mockClear();
            plugin.cleanupFileHash.mockClear();
            plugin.triggerUpdates.mockClear();

			emitVaultEvent('delete', folder);
            expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
            expect(plugin.cleanupFileHash).not.toHaveBeenCalled();
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('delete', folder);
        });

        test('handleFileOpen triggers only for real files', () => {
			eventManager.register();
            const file = mockTFile('test.md', 'test');
            const folder = {} as TAbstractFile;

			emitWorkspaceEvent('file-open', null);
			emitWorkspaceEvent('file-open', folder);
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();

			emitWorkspaceEvent('file-open', file);
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('file-open', file);
        });

        test('handleLayoutChange cleans roots and triggers layout update', () => {
			eventManager.register();
			emitWorkspaceEvent('layout-change');
            expect(plugin.cleanupReactRoots).toHaveBeenCalledTimes(1);
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('layout-change');
        });
    });

	describe('mode change metrics', () => {
		test('records metric only when detected mode actually changes', () => {
			eventManager.register();
			const markdownLeaf = createMarkdownLeaf({ mode: 'source' });
			const previewLeaf = createMarkdownLeaf({ mode: 'preview' });

			emitWorkspaceEvent('active-leaf-change', markdownLeaf);
            expect(recordMetric).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'influx.mode.change',
                    ctx: expect.objectContaining({ fromMode: 'none', toMode: 'editor' }),
                })
            );
            expect(plugin.triggerUpdates).not.toHaveBeenCalledWith('mode-change', expect.anything());

            (recordMetric as jest.Mock).mockClear();
			emitWorkspaceEvent('active-leaf-change', markdownLeaf);
            expect(recordMetric).not.toHaveBeenCalled();

			emitWorkspaceEvent('active-leaf-change', previewLeaf);
            expect(recordMetric).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'influx.mode.change',
                    ctx: expect.objectContaining({ fromMode: 'editor', toMode: 'preview' }),
                })
            );
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('mode-change', undefined);
        });

        test('triggers a mode-change refresh only for editor <-> preview transitions', () => {
            eventManager.register();
			const file = mockTFile('A.md', 'A');
			const editorLeaf = createMarkdownLeaf({ mode: 'source', file });
			const previewLeaf = createMarkdownLeaf({ mode: 'preview', file });
			const otherLeaf = {
				view: {
					getViewType: () => 'file-explorer',
                },
            };

			emitWorkspaceEvent('active-leaf-change', editorLeaf);
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();

			emitWorkspaceEvent('active-leaf-change', previewLeaf);
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('mode-change', file);

            plugin.triggerUpdates.mockClear();
			emitWorkspaceEvent('active-leaf-change', otherLeaf);
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();
        });

		test('treats reading-like preview leaves as renderable and ignores plain-object files for refresh payloads', () => {
			eventManager.register();
			const readingLeaf = createMarkdownLeaf({
				mode: 'preview',
				file: { path: 'Reading.md' },
			});
			const livePreviewLeaf = createMarkdownLeaf({
				mode: 'source',
				file: mockTFile('Reading.md', 'Reading'),
			});
			const otherLeaf = {
				view: {
					getViewType: () => 'graph',
				},
			};

			emitWorkspaceEvent('active-leaf-change', otherLeaf);
			expect(plugin.triggerUpdates).not.toHaveBeenCalled();

			(recordMetric as jest.Mock).mockClear();
			emitWorkspaceEvent('active-leaf-change', readingLeaf);
			expect(recordMetric).toHaveBeenCalledWith(
				expect.objectContaining({
					ctx: expect.objectContaining({ fromMode: 'other', toMode: 'preview' }),
				})
			);
			expect(plugin.triggerUpdates).not.toHaveBeenCalled();

			emitWorkspaceEvent('active-leaf-change', livePreviewLeaf);
			expect(plugin.triggerUpdates).toHaveBeenCalledWith('mode-change', livePreviewLeaf.view.file);
		});
    });
});

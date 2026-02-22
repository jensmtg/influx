import { TAbstractFile } from 'obsidian';
import { EventManager } from '../../src/managers/EventManager';
import { mockTFile } from '../mocks';
import { recordMetric } from '../../src/utils/metrics';

jest.mock('../../src/utils/metrics', () => ({
    recordMetric: jest.fn(),
}));

describe('EventManager', () => {
    let eventManager: EventManager;
    let plugin: any;

    beforeEach(() => {
        plugin = {
            app: {
                vault: { on: jest.fn() },
                workspace: { on: jest.fn() },
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

            expect(plugin.app.vault.on).toHaveBeenCalledWith('modify', expect.any(Function));
            expect(plugin.app.vault.on).toHaveBeenCalledWith('rename', expect.any(Function));
            expect(plugin.app.vault.on).toHaveBeenCalledWith('delete', expect.any(Function));
            expect(plugin.app.workspace.on).toHaveBeenCalledWith('file-open', expect.any(Function));
            expect(plugin.app.workspace.on).toHaveBeenCalledWith('layout-change', expect.any(Function));
            expect(plugin.app.workspace.on).toHaveBeenCalledWith('active-leaf-change', expect.any(Function));
            expect(plugin.registerEvent).toHaveBeenCalledTimes(6);
        });
    });

    describe('file event handlers', () => {
        test('handleModify: ignores folders, invalidates file cache, and respects liveUpdate flag', () => {
            const folder = {} as TAbstractFile;
            const file = mockTFile('test.md', 'test');

            (eventManager as any).handleModify(folder);
            expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();

            plugin.data.settings.liveUpdate = false;
            (eventManager as any).handleModify(file);
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('test.md');
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();

            plugin.data.settings.liveUpdate = true;
            (eventManager as any).handleModify(file);
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('modify', file);
        });

        test('handleRename: invalidates old/new paths for files and always triggers rename update', () => {
            const file = mockTFile('new.md', 'new');
            const folder = {} as TAbstractFile;

            (eventManager as any).handleRename(file, 'old.md');
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('old.md');
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('new.md');
            expect(plugin.cleanupFileHash).toHaveBeenCalledWith('old.md');
            expect(plugin.cleanupFileHash).toHaveBeenCalledWith('new.md');
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('rename', file);

            plugin.api.invalidateFileCache.mockClear();
            plugin.cleanupFileHash.mockClear();
            plugin.triggerUpdates.mockClear();

            (eventManager as any).handleRename(folder);
            expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
            expect(plugin.cleanupFileHash).not.toHaveBeenCalled();
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('rename', folder);
        });

        test('handleDelete: invalidates/cleans files and always triggers delete update', () => {
            const file = mockTFile('test.md', 'test');
            const folder = {} as TAbstractFile;

            (eventManager as any).handleDelete(file);
            expect(plugin.api.invalidateFileCache).toHaveBeenCalledWith('test.md');
            expect(plugin.cleanupFileHash).toHaveBeenCalledWith('test.md');
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('delete', file);

            plugin.api.invalidateFileCache.mockClear();
            plugin.cleanupFileHash.mockClear();
            plugin.triggerUpdates.mockClear();

            (eventManager as any).handleDelete(folder);
            expect(plugin.api.invalidateFileCache).not.toHaveBeenCalled();
            expect(plugin.cleanupFileHash).not.toHaveBeenCalled();
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('delete', folder);
        });

        test('handleFileOpen triggers only for real files', () => {
            const file = mockTFile('test.md', 'test');
            const folder = {} as TAbstractFile;

            (eventManager as any).handleFileOpen(null);
            (eventManager as any).handleFileOpen(folder);
            expect(plugin.triggerUpdates).not.toHaveBeenCalled();

            (eventManager as any).handleFileOpen(file);
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('file-open', file);
        });

        test('handleLayoutChange cleans roots and triggers layout update', () => {
            (eventManager as any).handleLayoutChange();
            expect(plugin.cleanupReactRoots).toHaveBeenCalledTimes(1);
            expect(plugin.triggerUpdates).toHaveBeenCalledWith('layout-change');
        });
    });

    describe('mode change metrics', () => {
        test('records metric only when detected mode actually changes', () => {
            const markdownLeaf = {
                view: {
                    getViewType: () => 'markdown',
                },
            };
            const previewLeaf = {
                view: {
                    currentMode: { type: 'preview' },
                    getViewType: () => 'markdown',
                },
            };

            (eventManager as any).handleActiveLeafChange(markdownLeaf);
            expect(recordMetric).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'influx.mode.change',
                    ctx: expect.objectContaining({ fromMode: 'none', toMode: 'editor' }),
                })
            );

            (recordMetric as jest.Mock).mockClear();
            (eventManager as any).handleActiveLeafChange(markdownLeaf);
            expect(recordMetric).not.toHaveBeenCalled();

            (eventManager as any).handleActiveLeafChange(previewLeaf);
            expect(recordMetric).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'influx.mode.change',
                    ctx: expect.objectContaining({ fromMode: 'editor', toMode: 'preview' }),
                })
            );
        });
    });
});

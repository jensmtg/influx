jest.mock('./main', () => ({
    __esModule: true,
    default: class MockInfluxPlugin {},
}));
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import type { LinkCache, TFile } from 'obsidian';
import InfluxFile from './InfluxFile';
import type { ApiAdapter } from './apiAdapter';
import type ObsidianInflux from './main';

function createApi(backlinkData: Map<string, LinkCache[]> | Record<string, LinkCache[]>) {
    const file = { path: 'Target.md', basename: 'Target' } as TFile;
    const api = {
        getFileByPath: jest.fn(() => file),
        getBacklinks: jest.fn(async () => ({ data: backlinkData })),
        getMetadata: jest.fn(),
        getShowStatus: jest.fn(() => true),
        getCollapsedStatus: jest.fn(() => false),
        getSettings: jest.fn(() => ({ listLimit: 0, showWithoutBacklinks: false })),
        isIncludableSource: jest.fn(() => true),
        renderAllMarkdownBlocks: jest.fn(),
    } as unknown as ApiAdapter;

    return { api, file };
}

const link = { link: 'Target' } as LinkCache;

describe('InfluxFile processing guard', () => {
    test('clears a deleted target without querying a stale file object', async () => {
        const { api } = createApi(new Map([['Source.md', [link]]]));
        const file = await InfluxFile.create('Target.md', api, {} as ObsidianInflux);
        (api.getFileByPath as jest.Mock).mockReturnValue(null);
        (api.getBacklinks as jest.Mock).mockClear();
        await expect(file.prepare(true)).resolves.toBe(false);
        expect(api.getBacklinks).not.toHaveBeenCalled();
        expect(file.components).toEqual([]);
    });

    test.each([
        new Map<string, LinkCache[]>(),
        {},
        new Map<string, LinkCache[]>([['Source.md', []]]),
        { 'Source.md': [] },
    ])('does no excerpt or rendering work without backlinks', async (data) => {
        const { api } = createApi(data);
        const influxFile = await InfluxFile.create(
            'Target.md',
            api,
            {} as ObsidianInflux,
        );
        const makeInfluxList = jest.spyOn(influxFile, 'makeInfluxList');
        const renderAllMarkdownBlocks = jest.spyOn(influxFile, 'renderAllMarkdownBlocks');

        await expect(influxFile.prepare()).resolves.toBe(false);

        expect(api.getMetadata).not.toHaveBeenCalled();
        expect(api.getShowStatus).toHaveBeenCalledWith(expect.objectContaining({ path: 'Target.md' }));
        expect(api.getCollapsedStatus).not.toHaveBeenCalled();
        expect(makeInfluxList).not.toHaveBeenCalled();
        expect(renderAllMarkdownBlocks).not.toHaveBeenCalled();
        expect(api.renderAllMarkdownBlocks).not.toHaveBeenCalled();
    });

    test('keeps the section visible without doing excerpt work when the empty state is enabled', async () => {
        const { api } = createApi(new Map());
        (api.getSettings as jest.Mock).mockReturnValue({
            listLimit: 0,
            showWithoutBacklinks: true,
        });
        const influxFile = await InfluxFile.create(
            'Target.md',
            api,
            {} as ObsidianInflux,
        );
        const makeInfluxList = jest.spyOn(influxFile, 'makeInfluxList');

        await expect(influxFile.prepare()).resolves.toBe(true);
        expect(influxFile.show).toBe(true);
        expect(makeInfluxList).not.toHaveBeenCalled();
        expect(api.renderAllMarkdownBlocks).not.toHaveBeenCalled();
    });

    test.each([
        {
            name: 'an added backlink',
            initial: new Map<string, LinkCache[]>(),
            current: new Map<string, LinkCache[]>([['Source.md', [link]]]),
            changedPath: 'Source.md',
            expected: true,
        },
        {
            name: 'a removed backlink',
            initial: new Map<string, LinkCache[]>([['Source.md', [link]]]),
            current: new Map<string, LinkCache[]>(),
            changedPath: 'Source.md',
            expected: true,
        },
        {
            name: 'an unrelated file',
            initial: new Map<string, LinkCache[]>([['Source.md', [link]]]),
            current: new Map<string, LinkCache[]>([['Source.md', [link]]]),
            changedPath: 'Other.md',
            expected: false,
        },
        {
            name: 'the target file itself',
            initial: new Map<string, LinkCache[]>(),
            current: new Map<string, LinkCache[]>(),
            changedPath: 'Target.md',
            expected: true,
        },
    ])('refreshes for $name', async ({ initial, current, changedPath, expected }) => {
        const { api } = createApi(initial);
        const influxFile = await InfluxFile.create(
            'Target.md',
            api,
            {} as ObsidianInflux,
        );
        (api.getBacklinks as jest.Mock).mockResolvedValue({ data: current });

        await expect(influxFile.shouldUpdate({ path: changedPath } as TFile)).resolves.toBe(expected);
    });

    test('checks a batched metadata update in one backlink refresh', async () => {
        const current = new Map<string, LinkCache[]>([['Source.md', [link]]]);
        const { api } = createApi(current);
        const influxFile = await InfluxFile.create(
            'Target.md',
            api,
            {} as ObsidianInflux,
        );
        (api.getBacklinks as jest.Mock).mockClear();

        await expect(influxFile.shouldUpdate([
            { path: 'Other.md' } as TFile,
            { path: 'Source.md' } as TFile,
        ])).resolves.toBe(true);
        expect(api.getBacklinks).toHaveBeenCalledTimes(1);
    });

    test('applies the list limit before reading source files', async () => {
        const target = { path: 'Target.md', basename: 'Target' } as TFile;
        const sources = new Map<string, TFile>([
            ['A.md', { path: 'A.md', basename: 'A' } as TFile],
            ['B.md', { path: 'B.md', basename: 'B' } as TFile],
            ['C.md', { path: 'C.md', basename: 'C' } as TFile],
        ]);
        const backlinkData = new Map(
            Array.from(sources.keys(), path => [path, [link]]),
        );
        const readFile = jest.fn(async () => 'A line with [[Target]].');
        const sortFilesForRendering = jest.fn((files: TFile[]) => files);
        const api = {
            getFileByPath: jest.fn((path: string) => path === target.path ? target : sources.get(path) ?? null),
            getBacklinks: jest.fn(async () => ({ data: backlinkData })),
            getMetadata: jest.fn((file: TFile) => file === target ? {} : {
                links: [{
                    link: 'Target',
                    position: { start: { line: 0 } },
                }],
            }),
            getShowStatus: jest.fn(() => true),
            getCollapsedStatus: jest.fn(() => false),
            isIncludableSource: jest.fn(() => true),
            sortFilesForRendering,
            getSettings: jest.fn(() => ({ listLimit: 1 })),
            readFile,
            isLinkToFile: jest.fn(() => true),
        } as unknown as ApiAdapter;

        const influxFile = await InfluxFile.create(
            target.path,
            api,
            {} as ObsidianInflux,
        );
        await influxFile.makeInfluxList();

        expect(sortFilesForRendering).toHaveBeenCalledWith(expect.any(Array));
        expect(readFile).toHaveBeenCalledTimes(1);
        expect(influxFile.inlinkingFiles).toHaveLength(1);
    });

    test('backfills the list limit when a higher-ranked source fails', async () => {
        const target = { path: 'Target.md', basename: 'Target' } as TFile;
        const sources = new Map<string, TFile>([
            ['A.md', { path: 'A.md', basename: 'A' } as TFile],
            ['B.md', { path: 'B.md', basename: 'B' } as TFile],
            ['C.md', { path: 'C.md', basename: 'C' } as TFile],
        ]);
        const backlinkData = new Map(
            Array.from(sources.keys(), path => [path, [link]]),
        );
        const readFile = jest.fn(async (file: TFile) => {
            if (file.path === 'A.md') {
                throw new Error('unreadable');
            }
            return 'A line with [[Target]].';
        });
        const api = {
            getFileByPath: jest.fn((path: string) => path === target.path ? target : sources.get(path) ?? null),
            getBacklinks: jest.fn(async () => ({ data: backlinkData })),
            getMetadata: jest.fn((file: TFile) => file === target ? {} : {
                links: [{
                    link: 'Target',
                    position: { start: { line: 0 } },
                }],
            }),
            getShowStatus: jest.fn(() => true),
            getCollapsedStatus: jest.fn(() => false),
            isIncludableSource: jest.fn(() => true),
            sortFilesForRendering: jest.fn((files: TFile[]) => files),
            getSettings: jest.fn(() => ({ listLimit: 2 })),
            readFile,
            isLinkToFile: jest.fn(() => true),
        } as unknown as ApiAdapter;
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        const influxFile = await InfluxFile.create(
            target.path,
            api,
            {} as ObsidianInflux,
        );
        await influxFile.makeInfluxList();
        consoleError.mockRestore();

        expect(readFile).toHaveBeenCalledTimes(3);
        expect(influxFile.inlinkingFiles.map(file => file.file.path)).toEqual(['B.md', 'C.md']);
    });
});

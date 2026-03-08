import { CachedMetadata } from 'obsidian';
import InfluxFile, { type InfluxFileApi } from '@/domain/backlinks/influx-file';
import { InlinkingFile } from '@/domain/backlinks/inlinking-file';
import type { BacklinksObject } from '@/domain/backlinks/types';
import { DEFAULT_SETTINGS } from '@/types';
import { cacheManager } from '@/platform/cache/cache-manager';
import { mockTFile } from '../../mocks';

jest.mock('@/platform/diagnostics/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

const makeFile = (path: string) => {
    const basename = path.split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? path;
    const file = mockTFile(path, basename);
    file.stat.mtime = 1000;
    file.stat.ctime = 1000;
    return file;
};

const createApiAdapterMock = (): jest.Mocked<InfluxFileApi> => ({
    getFileByPath: jest.fn(),
    getMetadata: jest.fn().mockReturnValue({} as CachedMetadata),
    getBacklinks: jest.fn().mockReturnValue({ data: new Map() }),
    getShowStatus: jest.fn().mockReturnValue(true),
    getCollapsedStatus: jest.fn().mockReturnValue(false),
    isIncludableSource: jest.fn().mockReturnValue(true),
    getSettings: jest.fn().mockReturnValue(DEFAULT_SETTINGS),
});

describe('InfluxFile', () => {
    let api: ReturnType<typeof createApiAdapterMock>;

    beforeEach(() => {
        InfluxFile.clearBuildCachesForTests();
        cacheManager.clearAll();
        api = createApiAdapterMock();
    });

    afterEach(() => {
        InfluxFile.clearBuildCachesForTests();
        cacheManager.clearAll();
        jest.restoreAllMocks();
    });

    describe('create and initialization', () => {
        test('initializes file, metadata, and visibility flags', async () => {
            const file = makeFile('target.md');
            api.getFileByPath.mockReturnValue(file);
            api.getMetadata.mockReturnValue({ frontmatter: {} } as CachedMetadata);
            api.getShowStatus.mockReturnValue(true);
            api.getCollapsedStatus.mockReturnValue(true);

            const influx = await InfluxFile.create('target.md', api);

            expect(influx.file).toBe(file);
            expect(influx.meta).toEqual({ frontmatter: {} });
            expect(influx.backlinks).toBeNull();
            expect(influx.show).toBe(true);
            expect(influx.collapsed).toBe(true);
            expect(influx.uuid).toBeTruthy();
        });

        test('handles missing target file gracefully', async () => {
            api.getFileByPath.mockReturnValue(null);
            const influx = await InfluxFile.create('missing.md', api);
            expect(influx.file).toBeNull();
            expect(influx.meta).toBeNull();
            expect(influx.backlinks).toBeNull();
        });
    });

    describe('shouldUpdate', () => {
        test('returns false when file/backlinks are unavailable', async () => {
            api.getFileByPath.mockReturnValue(null);
            const noFile = await InfluxFile.create('missing.md', api);
            expect(noFile.shouldUpdate(makeFile('any.md'))).toBe(false);

            const file = makeFile('target.md');
            api.getFileByPath.mockReturnValue(file);
            api.getBacklinks.mockReturnValue(null);
            const noBacklinks = await InfluxFile.create('target.md', api);
            expect(noBacklinks.shouldUpdate(makeFile('any.md'))).toBe(false);
        });

		test.each([
			[{ data: new Map([['Other.md', [{ link: 'Other.md' }]]]) }, 'Other.md', true],
			[{ data: { 'Other.md': [{ link: 'Other.md' }] } }, 'Other.md', true],
			[{ data: new Map([['path\\to\\file.md', [{ link: 'path\\to\\file.md' }]]]) }, 'path/to/file.md', true],
			[{ data: new Map([['other.md', [{ link: 'other.md' }]]]) }, 'missing.md', false],
		])(
            'matches target path correctly for backlinks shape',
            async (backlinks, changedPath, expected) => {
                const file = makeFile('target.md');
                api.getFileByPath.mockReturnValue(file);
                api.getBacklinks.mockReturnValue(backlinks as BacklinksObject);

                const influx = await InfluxFile.create('target.md', api);
				expect(influx.shouldUpdate(makeFile(changedPath))).toBe(expected);
			}
		);

		test('treats distinct-case backlink source paths as different files', async () => {
			const file = makeFile('target.md');
			api.getFileByPath.mockReturnValue(file);
			api.getBacklinks.mockReturnValue({ data: new Map([['Other.md', [{ link: 'Other.md' }]]]) } as BacklinksObject);

			const influx = await InfluxFile.create('target.md', api);
			expect(influx.shouldUpdate(makeFile('other.md'))).toBe(false);
		});

        test('refreshes backlinks from API on every shouldUpdate call', async () => {
            const file = makeFile('target.md');
            api.getFileByPath.mockReturnValue(file);
            api.getBacklinks
                .mockReturnValueOnce({ data: new Map([['old.md', []]]) })
                .mockReturnValueOnce({ data: new Map([['new.md', []]]) });

            const influx = await InfluxFile.create('target.md', api);
            expect(influx.shouldUpdate(makeFile('new.md'))).toBe(false);
            expect(influx.shouldUpdate(makeFile('new.md'))).toBe(true);
            expect((influx.backlinks?.data as Map<string, unknown>).has('new.md')).toBe(true);
        });
    });

    describe('makeInfluxList', () => {
        test('returns empty list/count when no file or no backlinks', async () => {
            api.getFileByPath.mockReturnValue(null);
            const noFile = await InfluxFile.create('missing.md', api);
            await noFile.makeInfluxList();
            expect(noFile.inlinkingFiles).toEqual([]);
            expect(noFile.totalEntryCount).toBe(0);

            const file = makeFile('target.md');
            api.getFileByPath.mockReturnValue(file);
            api.getBacklinks.mockReturnValue(null);
            const noBacklinks = await InfluxFile.create('target.md', api);
            await noBacklinks.makeInfluxList();
            expect(noBacklinks.inlinkingFiles).toEqual([]);
            expect(noBacklinks.totalEntryCount).toBe(0);
        });

			test('filters self-path and excluded sources, and preserves candidate total count', async () => {
			const target = makeFile('target.md');
			const sourceA = makeFile('source-a.md');
			const sourceB = makeFile('source-b.md');

			api.getFileByPath.mockImplementation((path: string) => {
				if (path === 'target.md' || path === 'TARGET.md') return target;
				if (path === 'source-a.md') return sourceA;
				if (path === 'source-b.md') return sourceB;
				return null;
            });
			api.getBacklinks.mockReturnValue({
				data: new Map([
					['target.md', [{ link: 'target.md' }]],
					['source-a.md', [{ link: 'source-a.md' }]],
					['source-b.md', [{ link: 'source-b.md' }]],
				]),
            });
            api.isIncludableSource.mockImplementation((path: string) => path !== 'source-b.md');

            const summarySpy = jest.spyOn(InlinkingFile.prototype, 'makeSummary').mockImplementation(async function () {
                this.summary = 'summary';
            });

            const influx = await InfluxFile.create('target.md', api);
            await influx.makeInfluxList();

            expect(influx.totalEntryCount).toBe(1);
            expect(influx.inlinkingFiles).toHaveLength(1);
            expect(influx.inlinkingFiles[0].file.path).toBe('source-a.md');
            summarySpy.mockRestore();
        });

        test('honors listLimit while retaining full totalEntryCount', async () => {
            const target = makeFile('target-limit.md');
            const source1 = makeFile('source-1.md');
            const source2 = makeFile('source-2.md');
            source1.stat.ctime = 1000;
            source2.stat.ctime = 2000;
            api.getSettings.mockReturnValue({ ...DEFAULT_SETTINGS, listLimit: 1 });
            api.getFileByPath.mockImplementation((path: string) => {
                if (path === 'target-limit.md') return target;
                if (path === 'source-1.md') return source1;
                if (path === 'source-2.md') return source2;
                return null;
            });
            api.getBacklinks.mockReturnValue({
                data: new Map([
                    ['source-1.md', [{ link: 'source-1.md' }]],
                    ['source-2.md', [{ link: 'source-2.md' }]],
                ]),
            });

            const summarySpy = jest.spyOn(InlinkingFile.prototype, 'makeSummary').mockImplementation(async function () {
                this.summary = 'summary';
            });

            const influx = await InfluxFile.create('target-limit.md', api);
            await influx.makeInfluxList();

            expect(influx.totalEntryCount).toBe(2);
            expect(influx.inlinkingFiles).toHaveLength(1);
            summarySpy.mockRestore();
        });

        test('dedupes concurrent list builds for same file/settings', async () => {
            const target = makeFile('target-dedupe.md');
            target.stat.mtime = 111;
            const source = makeFile('source-dedupe.md');
            source.stat.mtime = 222;

            api.getFileByPath.mockImplementation((path: string) => {
                if (path === 'target-dedupe.md') return target;
                if (path === 'source-dedupe.md') return source;
                return null;
            });
            api.getMetadata.mockReturnValue({ links: [], headings: [], frontmatter: null } as CachedMetadata);
            api.getBacklinks.mockReturnValue({ data: new Map([['source-dedupe.md', [{ link: 'source-dedupe.md' }]]]) });

            const summarySpy = jest
                .spyOn(InlinkingFile.prototype, 'makeSummary')
                .mockImplementation(async function () {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    this.summary = 'summary';
                });

			const a = await InfluxFile.create('target-dedupe.md', api);
			const b = await InfluxFile.create('target-dedupe.md', api);
            await Promise.all([a.makeInfluxList(), b.makeInfluxList()]);

            expect(summarySpy).toHaveBeenCalledTimes(1);
            expect(a.inlinkingFiles).toHaveLength(1);
            expect(b.inlinkingFiles).toHaveLength(1);
            summarySpy.mockRestore();
        });

        test('reuses recent completed list build for immediate sequential requests', async () => {
            const target = makeFile('target-reuse.md');
            const source = makeFile('source-reuse.md');
            api.getFileByPath.mockImplementation((path: string) => {
                if (path === 'target-reuse.md') return target;
                if (path === 'source-reuse.md') return source;
                return null;
            });
            api.getMetadata.mockReturnValue({ links: [], headings: [], frontmatter: null } as CachedMetadata);
            api.getBacklinks.mockReturnValue({ data: new Map([['source-reuse.md', [{ link: 'source-reuse.md' }]]]) });

            const summarySpy = jest.spyOn(InlinkingFile.prototype, 'makeSummary').mockImplementation(async function () {
                this.summary = 'summary';
            });

			const a = await InfluxFile.create('target-reuse.md', api);
			const b = await InfluxFile.create('target-reuse.md', api);
            await a.makeInfluxList();
            await b.makeInfluxList();

            expect(summarySpy).toHaveBeenCalledTimes(1);
            summarySpy.mockRestore();
        });

		test('does not reuse a recent list build after a dependent source invalidation', async () => {
			const target = makeFile('target-invalidate.md');
			const source = makeFile('source-invalidate.md');
			api.getFileByPath.mockImplementation((path: string) => {
				if (path === 'target-invalidate.md') return target;
				if (path === 'source-invalidate.md') return source;
				return null;
			});
			api.getMetadata.mockReturnValue({ links: [], headings: [], frontmatter: null } as CachedMetadata);
			api.getBacklinks.mockReturnValue({ data: new Map([['source-invalidate.md', [{ link: 'source-invalidate.md' }]]]) });

			const summarySpy = jest.spyOn(InlinkingFile.prototype, 'makeSummary').mockImplementation(async function () {
				this.summary = 'summary';
			});

			const first = await InfluxFile.create('target-invalidate.md', api);
			const second = await InfluxFile.create('target-invalidate.md', api);
			await first.makeInfluxList();
			cacheManager.invalidateFile('source-invalidate.md');
			await second.makeInfluxList();

			expect(summarySpy).toHaveBeenCalledTimes(2);
			summarySpy.mockRestore();
		});
    });

    describe('toEntries', () => {
        test('returns empty output when show is false', async () => {
            const file = makeFile('target.md');
            api.getFileByPath.mockReturnValue(file);
            api.getShowStatus.mockReturnValue(false);
            const influx = await InfluxFile.create('target.md', api);

            expect(influx.toEntries()).toEqual([]);
        });

        test('maps inlinking files into render entries directly', async () => {
            const file = makeFile('target.md');
            const source = makeFile('source.md');
            api.getFileByPath.mockReturnValue(file);
            api.getShowStatus.mockReturnValue(true);

            const influx = await InfluxFile.create('target.md', api);
            const inlinkingFile = new InlinkingFile(source, api);
            inlinkingFile.title = '  Title  ';
            inlinkingFile.summary = 'Body';
            influx.inlinkingFiles = [inlinkingFile];
            const result = influx.toEntries();

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                titleText: 'Title',
                summaryMarkdown: 'Body',
                sourcePath: 'source.md',
            });
            expect(influx.components).toEqual(result);
        });
    });
});

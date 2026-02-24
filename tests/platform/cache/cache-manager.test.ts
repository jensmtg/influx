import { InfluxCacheManager } from '@/platform/cache/cache-manager';
import { mockTFile } from '../../mocks';

jest.mock('@/platform/diagnostics/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

describe('InfluxCacheManager', () => {
    let cache: InfluxCacheManager;

    beforeEach(() => {
        cache = InfluxCacheManager.getInstance();
        cache.clearAll();
    });

    afterEach(() => {
        cache.clearAll();
        jest.restoreAllMocks();
    });

    describe('file cache', () => {
        test('stores and retrieves files with normalized/case-insensitive keys', () => {
            const file = mockTFile('Folder/Test.md', 'Test');
            cache.setFile('Folder/Test.md', file as any);

            expect(cache.getFile('folder\\test.md')).toBe(file);
            expect(cache.getFile('missing.md')).toBeNull();
        });

        test('expires stale file entries after ttl', () => {
            const file = mockTFile('stale.md', 'stale');
            cache.setFile('stale.md', file as any);
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + 6 * 60 * 1000);

            expect(cache.getFile('stale.md')).toBeNull();
        });
    });

    describe('backlinks cache', () => {
        test('stores and retrieves backlinks and expires stale entries', () => {
            const backlinks = { data: { 'a.md': [] } } as any;
            cache.setBacklinks('target.md', backlinks);
            expect(cache.getBacklinks('target.md')).toEqual(backlinks);

            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + 3 * 60 * 1000);
            expect(cache.getBacklinks('target.md')).toBeNull();
        });

        test('invalidating a source file clears dependent backlink targets', () => {
            cache.setBacklinks('target-a.md', { data: new Map([['source.md', []], ['other.md', []]]) } as any);
            cache.setBacklinks('target-b.md', { data: { 'source.md': [], 'another.md': [] } } as any);
            cache.setBacklinks('unrelated.md', { data: new Map([['different-source.md', []]]) } as any);

            cache.invalidateFile('source.md');

            expect(cache.getBacklinks('target-a.md')).toBeNull();
            expect(cache.getBacklinks('target-b.md')).toBeNull();
            expect(cache.getBacklinks('unrelated.md')).not.toBeNull();
        });

        test('source dependency invalidation uses normalized paths', () => {
            cache.setBacklinks('Target.md', { data: new Map([['Folder\\Source.md', []]]) } as any);
            cache.invalidateFile('folder/source.md');
            expect(cache.getBacklinks('target.md')).toBeNull();
        });
    });

    describe('settings and regex caches', () => {
        test('settings cache get/set works and invalidateSettingsCache clears dependent caches', () => {
            const settings = { showInfluxInSidebar: true } as any;
            cache.setSettings(settings);
            cache.setRegex('pattern', /pattern/);
            cache.setBacklinks('target.md', { data: {} } as any);
            cache.setSummary('source.md', 1, 'target.md', 'hash', {
                summary: 's',
                title: 't',
                titleLineNum: 1,
                isLinkInTitle: false,
            });

            expect(cache.getSettings()).toBe(settings);
            cache.invalidateSettingsCache();

            expect(cache.getSettings()).toBeNull();
            expect(cache.getRegex('pattern')).toBeUndefined();
            expect(cache.getBacklinks('target.md')).toBeNull();
            expect(cache.getSummary('source.md', 1, 'target.md', 'hash')).toBeNull();
        });

        test('invalid regex sentinel is returned as null', () => {
            cache.setInvalidRegex('broken');
            expect(cache.getRegex('broken')).toBeNull();
        });
    });

    describe('preview hash and settings hash', () => {
        test('preview file hash supports set/get/invalidate and tracks hit/miss stats', () => {
            cache.setPreviewFileHash('A.md', 'hash-a');
            expect(cache.getPreviewFileHash('a.md')).toBe('hash-a');
            expect(cache.getPreviewFileHash('missing.md')).toBeUndefined();

            cache.invalidatePreviewFileHash('a.md');
            expect(cache.getPreviewFileHash('a.md')).toBeUndefined();

            const stats = cache.getDebugInfo().stats;
            expect(stats.previewHashHits).toBeGreaterThanOrEqual(1);
            expect(stats.previewHashMisses).toBeGreaterThanOrEqual(2);
        });

        test('settings hash supports set/get', () => {
            expect(cache.getSettingsHash()).toBeNull();
            cache.setSettingsHash('abc123');
            expect(cache.getSettingsHash()).toBe('abc123');
        });
    });

    describe('summary cache', () => {
        test('stores and retrieves summaries with normalized source/target paths', () => {
            cache.setSummary('Folder\\Source.md', 1000, 'Folder\\Target.md', 'hash', {
                summary: 'summary',
                title: 'title',
                titleLineNum: 2,
                isLinkInTitle: true,
            });

            expect(cache.getSummary('folder/source.md', 1000, 'folder/target.md', 'hash')).toEqual({
                summary: 'summary',
                title: 'title',
                titleLineNum: 2,
                isLinkInTitle: true,
            });
        });

        test('expires stale summary entries and invalidates by source/target file changes', () => {
            cache.setSummary('source.md', 1000, 'target-a.md', 'hash', {
                summary: 'a',
                title: 'a',
                titleLineNum: 1,
                isLinkInTitle: false,
            });
            cache.setSummary('source-b.md', 1000, 'target-a.md', 'hash', {
                summary: 'b',
                title: 'b',
                titleLineNum: 2,
                isLinkInTitle: false,
            });

            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
            expect(cache.getSummary('source.md', 1000, 'target-a.md', 'hash')).toBeNull();
            jest.restoreAllMocks();

            cache.setSummary('source.md', 1001, 'target-a.md', 'hash', {
                summary: 'c',
                title: 'c',
                titleLineNum: 3,
                isLinkInTitle: false,
            });
            cache.invalidateFile('target-a.md');
            expect(cache.getSummary('source.md', 1001, 'target-a.md', 'hash')).toBeNull();
        });
    });

    describe('global clear and debug info', () => {
        test('clearAll wipes caches and resets stats', () => {
            const file = mockTFile('test.md', 'test');
            cache.setFile('test.md', file as any);
            cache.getFile('test.md');
            cache.getFile('missing.md');

            cache.clearAll();

            expect(cache.getFile('test.md')).toBeNull();
            const stats = cache.getDebugInfo().stats;
            expect(stats.fileHits).toBe(0);
            expect(stats.fileMisses).toBe(1);
        });

        test('getDebugInfo reports populated cache sections', () => {
            cache.setFile('test.md', mockTFile('test.md', 'test') as any);
            cache.setBacklinks('test.md', { data: {} } as any);

            const info = cache.getDebugInfo();
            expect(info.fileCache.size).toBe(1);
            expect(info.backlinksCache.size).toBe(1);
            expect(info).toHaveProperty('regexCache');
            expect(info).toHaveProperty('summaryCache');
            expect(info).toHaveProperty('stats');
        });
    });
});

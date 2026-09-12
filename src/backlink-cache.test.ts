import {
    BACKLINK_CACHE_GITHUB_URL,
    BACKLINK_CACHE_OBSIDIAN_URL,
    getFreshBacklinks,
    isBacklinkCacheActive,
    type BacklinkMetadataCache,
    type RawBacklinksObject,
} from './backlink-cache';
import type { LinkCache, TFile } from 'obsidian';

const file = { path: 'Target.md' } as TFile;
const link = { link: 'Target' } as LinkCache;
const nativeResult: RawBacklinksObject = { data: { 'Native.md': [link] } };
const safeResult: RawBacklinksObject = { data: { 'Safe.md': [link] } };

describe('Backlink Cache integration', () => {
    test('uses Obsidian backlinks when the optional patch is absent', async () => {
        const native = jest.fn(() => nativeResult);
        const metadataCache = { getBacklinksForFile: native } as BacklinkMetadataCache;

        await expect(getFreshBacklinks(metadataCache, file, true)).resolves.toBe(nativeResult);
        expect(native).toHaveBeenCalledWith(file);
        expect(isBacklinkCacheActive(metadataCache)).toBe(false);
    });

    test('uses the safe cache path when Backlink Cache is active', async () => {
        const native = jest.fn(() => nativeResult);
        const safe = jest.fn(async () => safeResult);
        const getBacklinksForFile = Object.assign(native, {
            originalFn: jest.fn(() => nativeResult),
            safe,
        });
        const metadataCache = { getBacklinksForFile } as BacklinkMetadataCache;

        await expect(getFreshBacklinks(metadataCache, file, true)).resolves.toBe(safeResult);
        expect(safe).toHaveBeenCalledWith(file);
        expect(native).not.toHaveBeenCalled();
        expect(isBacklinkCacheActive(metadataCache)).toBe(true);
    });

    test('bypasses the patch when the integration is disabled', async () => {
        const patched = jest.fn(() => safeResult);
        const originalFn = jest.fn(() => nativeResult);
        const safe = jest.fn(async () => safeResult);
        const getBacklinksForFile = Object.assign(patched, { originalFn, safe });
        const metadataCache = { getBacklinksForFile } as BacklinkMetadataCache;

        await expect(getFreshBacklinks(metadataCache, file, false)).resolves.toBe(nativeResult);
        expect(originalFn).toHaveBeenCalledWith(file);
        expect(safe).not.toHaveBeenCalled();
        expect(patched).not.toHaveBeenCalled();
    });

    test('falls back to Obsidian when the optional cache returns empty', async () => {
        const emptyResult: RawBacklinksObject = { data: new Map() };
        const patched = jest.fn(() => emptyResult);
        const originalFn = jest.fn(() => nativeResult);
        const safe = jest.fn(async () => emptyResult);
        const getBacklinksForFile = Object.assign(patched, { originalFn, safe });
        const metadataCache = { getBacklinksForFile } as BacklinkMetadataCache;

        await expect(getFreshBacklinks(metadataCache, file, true)).resolves.toBe(nativeResult);
        expect(safe).toHaveBeenCalledWith(file);
        expect(originalFn).toHaveBeenCalledWith(file);
    });

    test('falls back to Obsidian when the optional cache fails', async () => {
        const patched = jest.fn(() => safeResult);
        const originalFn = jest.fn(() => nativeResult);
        const safe = jest.fn(async () => { throw new Error('cache unavailable'); });
        const getBacklinksForFile = Object.assign(patched, { originalFn, safe });
        const metadataCache = { getBacklinksForFile } as BacklinkMetadataCache;

        await expect(getFreshBacklinks(metadataCache, file, true)).resolves.toBe(nativeResult);
        expect(originalFn).toHaveBeenCalledWith(file);
    });

    test('detects the patch lazily after adapter construction', async () => {
        const native = jest.fn(() => nativeResult);
        const metadataCache = { getBacklinksForFile: native } as BacklinkMetadataCache;

        await expect(getFreshBacklinks(metadataCache, file, true)).resolves.toBe(nativeResult);

        Object.assign(native, {
            originalFn: jest.fn(() => nativeResult),
            safe: jest.fn(async () => safeResult),
        });

        await expect(getFreshBacklinks(metadataCache, file, true)).resolves.toBe(safeResult);
        expect(isBacklinkCacheActive(metadataCache)).toBe(true);
    });

    test('keeps the documented settings links stable', () => {
        expect(BACKLINK_CACHE_OBSIDIAN_URL).toBe('https://obsidian.md/plugins?id=backlink-cache');
        expect(BACKLINK_CACHE_GITHUB_URL).toBe('https://github.com/mnaoumov/obsidian-backlink-cache');
    });
});

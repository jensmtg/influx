import type { LinkCache, TFile } from 'obsidian';

export const BACKLINK_CACHE_OBSIDIAN_URL = 'https://obsidian.md/plugins?id=backlink-cache';
export const BACKLINK_CACHE_GITHUB_URL = 'https://github.com/mnaoumov/obsidian-backlink-cache';

export type RawBacklinksObject = {
    data: Map<string, LinkCache[]> | Record<string, LinkCache[]>;
};

type GetBacklinksForFile = ((file: TFile | string) => RawBacklinksObject) & {
    originalFn?: (file: TFile) => RawBacklinksObject;
    safe?: (file: TFile | string) => Promise<RawBacklinksObject>;
};

export type BacklinkMetadataCache = {
    getBacklinksForFile?: GetBacklinksForFile;
};

function hasBacklinkEntries(backlinks: RawBacklinksObject | null | undefined): boolean {
    const data = backlinks?.data;
    if (!data) {
        return false;
    }

    const linkGroups = data instanceof Map ? data.values() : Object.values(data);
    for (const links of linkGroups) {
        if (Array.isArray(links) && links.length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Feature-detect Backlink Cache's documented runtime patch.
 * This is intentionally checked on demand so plugin load order does not matter.
 */
export function isBacklinkCacheActive(metadataCache: BacklinkMetadataCache): boolean {
    const getBacklinksForFile = metadataCache.getBacklinksForFile;
    return typeof getBacklinksForFile?.safe === 'function'
        && typeof getBacklinksForFile?.originalFn === 'function';
}

/**
 * Use Backlink Cache only when requested. When its safe result is empty or
 * fails, check Obsidian's unpatched implementation so an incomplete optional
 * cache cannot hide real linked mentions.
 */
export async function getFreshBacklinks(
    metadataCache: BacklinkMetadataCache,
    file: TFile,
    useBacklinkCache: boolean,
): Promise<RawBacklinksObject> {
    const getBacklinksForFile = metadataCache.getBacklinksForFile;
    if (typeof getBacklinksForFile !== 'function') {
        return { data: new Map() };
    }

    if (isBacklinkCacheActive(metadataCache)) {
        const getNativeBacklinks = () => getBacklinksForFile.originalFn!.call(metadataCache, file);
        if (!useBacklinkCache) {
            return getNativeBacklinks();
        }

        try {
            const cachedBacklinks = await getBacklinksForFile.safe!.call(metadataCache, file);
            if (hasBacklinkEntries(cachedBacklinks)) {
                return cachedBacklinks;
            }

            const nativeBacklinks = getNativeBacklinks();
            return hasBacklinkEntries(nativeBacklinks) ? nativeBacklinks : cachedBacklinks;
        } catch {
            return getNativeBacklinks();
        }
    }

    return getBacklinksForFile.call(metadataCache, file);
}

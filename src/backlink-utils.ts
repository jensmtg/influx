import type { LinkCache } from 'obsidian';

export type BacklinkData = Map<string, LinkCache[]> | Record<string, LinkCache[]>;

export interface BacklinksLike {
    data?: BacklinkData;
    /** Snapshot of native incoming paths before optional data is added. */
    incomingSourcePaths?: readonly string[];
    /** Native incoming links before any optional relationship augmentation. */
    incomingData?: BacklinkData;
}

/**
 * Return the source paths that contain at least one backlink.
 * Obsidian has exposed backlink data as both a Map and a plain object.
 */
export function getBacklinkSourcePaths(backlinks: BacklinksLike | null | undefined): string[] {
    if (backlinks?.incomingSourcePaths) {
        return [...backlinks.incomingSourcePaths];
    }

    const data = backlinks?.incomingData ?? backlinks?.data;
    if (!data) {
        return [];
    }

    const entries = data instanceof Map
        ? Array.from(data.entries())
        : Object.entries(data);

    return entries
        .filter(([, links]) => Array.isArray(links) && links.length > 0)
        .map(([path]) => path);
}

/** True only when at least one actual incoming link is present. */
export function hasBacklinkEntries(backlinks: BacklinksLike | null | undefined): boolean {
    if (backlinks?.incomingSourcePaths) {
        return backlinks.incomingSourcePaths.length > 0;
    }

    const data = backlinks?.incomingData ?? backlinks?.data;
    if (!data) {
        return false;
    }

    const linkGroups = data instanceof Map
        ? data.values()
        : Object.values(data);

    for (const links of linkGroups) {
        if (Array.isArray(links) && links.length > 0) {
            return true;
        }
    }
    return false;
}

/** Stable signature used to detect backlink additions and removals. */
export function getBacklinkSourceSignature(backlinks: BacklinksLike | null | undefined): string {
    return getBacklinkSourcePaths(backlinks).sort().join('\n');
}

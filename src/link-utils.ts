/**
 * Pure functions for link processing and comparison
 * Extracted from ApiAdapter to be easily testable
 */

import { LinkCache } from 'obsidian';

/**
 * Extracts and normalizes a link name for comparison
 * Extracted from ApiAdapter.compareLinkName()
 */
export function extractLinkName(link: LinkCache): string {
    // Format link name to be comparable with base names
    const path = link.link;
    
    // Grab only the filename from a multi-folder path
    const filenameOnly = path.split(/[\\/]/).slice(-1)[0] || path;

    // Strip block/heading refs and only a trailing ".md" extension.
    const withoutRefs = filenameOnly.split(/[#^]/)[0];
    const linkname = withoutRefs.replace(/\.md$/i, '');

    return linkname.toLowerCase();
}

/**
 * Compares a link name with a basename for matching
 * Extracted from ApiAdapter.compareLinkName()
 * Normalizes both sides for case-insensitive comparison
 */
export function compareLinkName(link: LinkCache, basename: string): boolean {
    const linkName = extractLinkName(link);
    return linkName === basename.toLowerCase();
}

/**
 * Filters links that match a specific basename
 */
export function filterLinksByBasename(links: LinkCache[], basename: string): LinkCache[] {
    return links.filter(link => compareLinkName(link, basename));
}

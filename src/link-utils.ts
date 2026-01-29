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
    const filenameOnly = path.split("/").slice(-1)[0];

    // Strip any block and heading references from the end and the ".md" extension
    const linkname = filenameOnly.split(/[#^]/)[0].split(".md")[0];

    return linkname.toLowerCase();
}

/**
 * Compares a link name with a basename for matching
 * Extracted from ApiAdapter.compareLinkName()
 */
export function compareLinkName(link: LinkCache, basename: string): boolean {
    const linkName = extractLinkName(link);
    return linkName === basename.toLowerCase();
}

/**
 * Processes HTML content by removing paragraph tags and cleaning up underscores
 * Extracted from ApiAdapter.renderAllMarkdownBlocks()
 */
export function processTitleHTML(html: string): string {
    return html
        .replace(/<\/?p[^>]*>/g, '')  // Remove <p>, </p> tags
        .replace(/^_/, '');            // Remove leading underscore (now at start after p tag removal)
}

/**
 * Filters links that match a specific basename
 */
export function filterLinksByBasename(links: LinkCache[], basename: string): LinkCache[] {
    return links.filter(link => compareLinkName(link, basename));
}

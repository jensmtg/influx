/**
 * Pure functions for front matter link processing
 * These functions are extracted from ApiAdapter to be easily testable
 */

import { FrontmatterLinkCache, LinkCache } from 'obsidian';
import { ObsidianInfluxSettings } from './main';

/**
 * Validates and filters front matter property names
 * Extracted from ApiAdapter.getValidProperties()
 */
export function validateFrontmatterProperties(properties: string[]): string[] {
    if (!Array.isArray(properties)) {
        return [];
    }
    
    return properties.filter(prop => 
        prop && 
        typeof prop === 'string' && 
        prop.trim().length > 0
    );
}

/**
 * Determines if front matter links should be included based on settings
 * Extracted from ApiAdapter.shouldIncludeFrontmatterLinks()
 */
export function shouldIncludeFrontmatterLinks(settings: ObsidianInfluxSettings): boolean {
    return settings.includeFrontmatterLinks;
}

/**
 * Converts a FrontmatterLinkCache to LinkCache format with fallbacks
 * Extracted from ApiAdapter.mergeFrontmatterLinks() conversion logic
 */
export function convertFrontmatterLinkToLinkCache(fmLink: FrontmatterLinkCache): LinkCache | null {
    // Validate individual link
    if (!fmLink || typeof fmLink !== 'object' || !fmLink.link || typeof fmLink.link !== 'string') {
        return null;
    }

    return {
        link: fmLink.link,
        displayText: fmLink.displayText || fmLink.link, // Fallback to link if displayText is missing
        position: {
            start: { line: -1, col: -1, offset: -1 }, // Front matter sentinel
            end: { line: -1, col: -1, offset: -1 }
        },
        original: fmLink.original || `[[${fmLink.link}]]` // Fallback if original is missing
    };
}

/**
 * Filters front matter links by specified properties
 * Extracted from ApiAdapter.mergeFrontmatterLinks() filtering logic
 */
export function filterFrontmatterLinks(
    frontmatterLinks: FrontmatterLinkCache[], 
    targetProperties: string[]
): FrontmatterLinkCache[] {
    if (!Array.isArray(frontmatterLinks)) {
        return [];
    }

    // Filter by specified properties if provided
    return targetProperties.length > 0
        ? frontmatterLinks.filter(link => 
            targetProperties.includes(link.key || ''))
        : frontmatterLinks;
}

/**
 * Merges converted front matter links into backlinks structure
 * Extracted from ApiAdapter.mergeFrontmatterLinks() merging logic
 */
export function mergeConvertedLinksIntoBacklinks(
    backlinks: { data: Map<string, LinkCache[]> | Record<string, LinkCache[]> }, 
    convertedLinks: LinkCache[]
): void {
    if (!backlinks?.data || !Array.isArray(convertedLinks)) {
        return;
    }

    for (const linkCache of convertedLinks) {
        if (!linkCache?.link) continue;
        
        // Add to backlinks structure
        if (backlinks.data instanceof Map) {
            if (!backlinks.data.has(linkCache.link)) {
                backlinks.data.set(linkCache.link, []);
            }
            backlinks.data.get(linkCache.link)!.push(linkCache);
        } else {
            if (!backlinks.data[linkCache.link]) {
                backlinks.data[linkCache.link] = [];
            }
            backlinks.data[linkCache.link].push(linkCache);
        }
    }
}

/**
 * Complete front matter link processing pipeline
 * Combines all the pure functions for end-to-end processing
 */
export function processFrontmatterLinks(
    backlinks: { data: Map<string, LinkCache[]> | Record<string, LinkCache[]> },
    frontmatterLinks: FrontmatterLinkCache[],
    settings: ObsidianInfluxSettings
): { data: Map<string, LinkCache[]> | Record<string, LinkCache[]> } {
    try {
        // Validate inputs
        if (!backlinks || !Array.isArray(frontmatterLinks)) {
            return backlinks;
        }

        // Check if front matter processing is enabled
        if (!shouldIncludeFrontmatterLinks(settings)) {
            return backlinks;
        }

        // Get and validate properties
        const validProperties = validateFrontmatterProperties(settings.frontmatterProperties);
        
        // Filter links by properties
        const filteredLinks = filterFrontmatterLinks(frontmatterLinks, validProperties);
        
        // Convert to LinkCache format
        const convertedLinks = filteredLinks
            .map(link => convertFrontmatterLinkToLinkCache(link))
            .filter((link): link is LinkCache => link !== null);
        
        // Merge into backlinks
        mergeConvertedLinksIntoBacklinks(backlinks, convertedLinks);
        
        return backlinks;
    } catch (error) {
        console.error('Error in processFrontmatterLinks:', error);
        // Graceful fallback - don't break the entire backlinks process
        return backlinks;
    }
}

/**
 * Pure functions for front matter link processing
 * These functions are extracted from ApiAdapter to be easily testable
 */

import { FrontmatterLinkCache, LinkCache, CachedMetadata } from 'obsidian';
import { ObsidianInfluxSettings } from './types';
import { logger } from './utils/logger';
import { compareLinkName } from './link-utils';

type BacklinksData = Map<string, LinkCache[]> | Record<string, LinkCache[]>;
type BacklinksContainer = { data: BacklinksData };

function appendLinkToBacklinks(data: BacklinksData, linkCache: LinkCache): void {
    if (data instanceof Map) {
        const existing = data.get(linkCache.link);
        if (existing) {
            existing.push(linkCache);
            return;
        }
        data.set(linkCache.link, [linkCache]);
        return;
    }

    (data[linkCache.link] ||= []).push(linkCache);
}

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
    backlinks: BacklinksContainer,
    convertedLinks: LinkCache[]
): void {
    if (!backlinks?.data || !Array.isArray(convertedLinks)) {
        return;
    }

    for (const linkCache of convertedLinks) {
        if (!linkCache?.link) continue;
        appendLinkToBacklinks(backlinks.data, linkCache);
    }
}

/**
 * Checks if a specific link in a source file's backlinks came from frontmatter
 * @param sourcePath - Path to the source file
 * @param targetBasename - Basename of the target file (the file being linked to)
 * @param linkPosition - Position of the link to check
 * @param getMetadataFn - Function to get metadata for a file
 * @returns true if the link is from frontmatter, false otherwise
 */
function isLinkFromFrontmatter(
    sourcePath: string,
    targetBasename: string,
    linkPosition: LinkCache['position'],
    getMetadataFn: (path: string) => CachedMetadata | null
): boolean {
    const metadata = getMetadataFn(sourcePath);
    
    logger.debug('isLinkFromFrontmatter checking', {
        sourcePath,
        targetBasename,
        linkPosition,
        hasMetadata: !!metadata,
        hasFrontmatterLinks: !!(metadata?.frontmatterLinks),
        frontmatterLinksCount: metadata?.frontmatterLinks?.length || 0,
        frontmatterLinks: metadata?.frontmatterLinks?.map(fml => ({ link: fml.link, key: fml.key }))
    });

    if (!metadata?.frontmatterLinks || !Array.isArray(metadata.frontmatterLinks)) {
        return false;
    }

    // Check if any frontmatter link matches the target
    for (const fmLink of metadata.frontmatterLinks) {
        // Create a minimal LinkCache-like object for comparison
        // FrontmatterLinkCache has 'link' property, which is all we need for compareLinkName
        const tempLinkCache = { link: fmLink.link } as LinkCache;
        
        logger.debug('Checking frontmatter link against target', {
            fmLinkLink: fmLink.link,
            fmLinkKey: fmLink.key,
            targetBasename,
            linkPositionStartLine: linkPosition?.start?.line,
            isMatch: compareLinkName(tempLinkCache, targetBasename)
        });
        
        // Use compareLinkName for robust link matching (handles paths, extensions, case-insensitivity)
        if (compareLinkName(tempLinkCache, targetBasename)) {
            // If position is undefined, assume it's from frontmatter (conservative filtering)
            if (linkPosition?.start?.line === undefined) {
                logger.debug('MATCH: Link identified as frontmatter link (undefined position)', {
                    sourcePath,
                    targetBasename,
                    linkPosition,
                    fmLinkMatched: fmLink.link
                });
                return true;
            }
            
            // If position is defined and near start of file (lines 0-2), it's frontmatter
            if (linkPosition.start.line >= 0 && linkPosition.start.line <= 2) {
                logger.debug('MATCH: Link identified as frontmatter link (position 0-2)', {
                    sourcePath,
                    targetBasename,
                    linkPosition,
                    fmLinkMatched: fmLink.link
                });
                return true;
            }
        }
    }

    logger.debug('NO MATCH: No frontmatter link matched', {
        sourcePath,
        targetBasename,
        linkPosition
    });
    return false;
}

function countTotalLinks(data: BacklinksData): number {
    if (data instanceof Map) {
        return Array.from(data.values()).reduce((sum, links) => sum + links.length, 0);
    }
    return Object.values(data).reduce((sum, links) => sum + links.length, 0);
}

function filterLinksForSource(
    sourcePath: string,
    links: LinkCache[],
    targetBasename: string,
    getMetadataFn: (path: string) => CachedMetadata | null
): { filtered: LinkCache[]; originalCount: number; removedCount: number } {
    logger.debug('Processing source file links', {
        sourcePath,
        linkCount: links.length,
        linkPositions: links.map(l => ({ link: l.link, line: l.position?.start?.line }))
    });

    const originalCount = links.length;
    const filtered = links.filter((link: LinkCache) => {
        const shouldFilterOut = isLinkFromFrontmatter(sourcePath, targetBasename, link.position, getMetadataFn);
        logger.debug('Filter decision for individual link', {
            sourcePath,
            linkName: link.link,
            linkPosition: link.position,
            shouldFilterOut
        });
        return !shouldFilterOut;
    });
    const removedCount = originalCount - filtered.length;

    logger.debug('Filter result for source', {
        sourcePath,
        originalCount,
        filteredCount: filtered.length,
        willUpdate: removedCount > 0
    });

    return {
        filtered,
        originalCount,
        removedCount,
    };
}

/**
 * Removes front matter links from backlinks by checking source file metadata
 * This correctly identifies frontmatter links even when Obsidian's getBacklinksForFile
 * includes them with their real positions (not sentinel -1 values)
 */
export function filterFrontmatterLinksFromBacklinks(
    backlinks: BacklinksContainer,
    targetBasename: string,
    getMetadataFn: (path: string) => CachedMetadata | null
): BacklinksContainer {
    logger.debug('filterFrontmatterLinksFromBacklinks called', {
        targetBasename,
        hasBacklinks: !!backlinks,
        hasData: !!backlinks?.data,
        dataType: backlinks?.data instanceof Map ? 'Map' : 'Object'
    });

    if (!backlinks?.data) {
        return backlinks;
    }

    const initialSourceCount = backlinks.data instanceof Map
        ? backlinks.data.size
        : Object.keys(backlinks.data).length;
    const initialLinkCount = countTotalLinks(backlinks.data);

    let linksRemoved = 0;

    if (backlinks.data instanceof Map) {
        const dataMap = backlinks.data;
        logger.debug('Processing Map backlinks', {
            entryCount: dataMap.size
        });

        for (const [sourcePath, links] of dataMap.entries()) {
            const { filtered, originalCount, removedCount } = filterLinksForSource(
                sourcePath,
                links,
                targetBasename,
                getMetadataFn
            );

            if (removedCount > 0) {
                if (filtered.length === 0) {
                    // All links were filtered out - DELETE the key entirely
                    dataMap.delete(sourcePath);
                    logger.debug('Deleted source from Map (all links filtered)', {
                        sourcePath,
                        originalCount,
                        filteredCount: filtered.length,
                        removed: removedCount
                    });
                } else {
                    // Some links remain - UPDATE the key with filtered array
                    dataMap.set(sourcePath, filtered);
                    logger.debug('Updated Map with filtered links', {
                        sourcePath,
                        originalCount,
                        filteredCount: filtered.length,
                        removed: removedCount
                    });
                }
                linksRemoved += removedCount;
            }
        }
    } else {
        const dataRecord = backlinks.data;
        logger.debug('Processing Object backlinks', {
            entryCount: Object.keys(dataRecord).length
        });

        for (const sourcePath in dataRecord) {
            const links = dataRecord[sourcePath];
            const { filtered, originalCount, removedCount } = filterLinksForSource(
                sourcePath,
                links,
                targetBasename,
                getMetadataFn
            );

            if (removedCount > 0) {
                if (filtered.length === 0) {
                    // All links were filtered out - DELETE the key entirely
                    delete dataRecord[sourcePath];
                    logger.debug('Deleted source from Object (all links filtered)', {
                        sourcePath,
                        originalCount,
                        filteredCount: filtered.length,
                        removed: removedCount
                    });
                } else {
                    // Some links remain - UPDATE the key with filtered array
                    dataRecord[sourcePath] = filtered;
                    logger.debug('Updated Object with filtered links', {
                        sourcePath,
                        originalCount,
                        filteredCount: filtered.length,
                        removed: removedCount
                    });
                }
                linksRemoved += removedCount;
            }
        }
    }

    const finalSourceCount = backlinks.data instanceof Map
        ? backlinks.data.size
        : Object.keys(backlinks.data).length;
    const finalLinkCount = countTotalLinks(backlinks.data);

    logger.debug(`FilterFrontmatterLinksFromBacklinks complete: Removed ${linksRemoved} front matter links`, {
        targetBasename,
        initialSourceCount,
        finalSourceCount,
        initialLinkCount,
        finalLinkCount,
        linksRemoved,
    });

    return backlinks;
}

/**
 * Complete front matter link processing pipeline
 * Combines all the pure functions for end-to-end processing
 */
export function processFrontmatterLinks(
    backlinks: BacklinksContainer,
    frontmatterLinks: FrontmatterLinkCache[],
    settings: ObsidianInfluxSettings
): BacklinksContainer {
    try {
        // Validate inputs first before accessing properties
        if (!backlinks || !Array.isArray(frontmatterLinks)) {
            logger.debug('Skipping frontmatter processing - invalid inputs', {
                hasBacklinks: !!backlinks,
                isArray: Array.isArray(frontmatterLinks)
            });
            return backlinks;
        }

        logger.debug('processFrontmatterLinks started', {
            includeFrontmatterLinks: settings.includeFrontmatterLinks,
            frontmatterProperties: settings.frontmatterProperties,
            frontmatterLinksCount: frontmatterLinks.length
        });

        // Check if front matter processing is enabled
        if (!shouldIncludeFrontmatterLinks(settings)) {
            logger.debug('Skipping frontmatter processing - disabled in settings');
            return backlinks;
        }

        // Get and validate properties
        const validProperties = validateFrontmatterProperties(settings.frontmatterProperties);
        logger.debug('Validated frontmatter properties', {
            original: settings.frontmatterProperties,
            valid: validProperties
        });

        // Filter links by properties
        const filteredLinks = filterFrontmatterLinks(frontmatterLinks, validProperties);
        logger.debug('Filtered frontmatter links', {
            originalCount: frontmatterLinks.length,
            filteredCount: filteredLinks.length
        });

        // Convert to LinkCache format
        const convertedLinks = filteredLinks
            .map(link => convertFrontmatterLinkToLinkCache(link))
            .filter((link): link is LinkCache => link !== null);

        logger.debug('Converted frontmatter links', {
            convertedCount: convertedLinks.length
        });

        // Merge into backlinks
        mergeConvertedLinksIntoBacklinks(backlinks, convertedLinks);

        logger.debug('Frontmatter links merged successfully');
        return backlinks;
    } catch (error) {
        logger.error('Error in processFrontmatterLinks:', { error });
        // Graceful fallback - don't break the entire backlinks process
        return backlinks;
    }
}

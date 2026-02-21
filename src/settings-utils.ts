/**
 * Pure utility functions for settings validation and processing
 * Extracted from settings.tsx and apiAdapter.tsx for testability
 */

import { CachedMetadata } from 'obsidian';

export { compareLinkName } from './link-utils';

export interface ValidationResult {
    valid: string[];
    invalid: string[];
}

export type ShowBehaviour = 'OPT_IN' | 'OPT_OUT';
export type SortingAttribute = 'ctime' | 'mtime' | 'FILENAME';
export type SortingPrinciple = 'NEWEST_FIRST' | 'OLDEST_FIRST';

export interface FilterSettings {
    showBehaviour: ShowBehaviour;
    inclusionPattern: string[];
    exclusionPattern: string[];
    sourceBehaviour: ShowBehaviour;
    sourceInclusionPattern: string[];
    sourceExclusionPattern: string[];
    collapsedPattern: string[];
    requireInfluxFrontmatterKey?: boolean;
}

/**
 * Checks if a file has 'influx' frontmatter key set to true.
 *
 * @param metadata - CachedMetadata for file
 * @returns true if 'influx: true' is present in frontmatter (as boolean or string), false otherwise
 */
export function hasInfluxFrontmatterKey(metadata: CachedMetadata | null | undefined): boolean {
    if (!metadata?.frontmatter) {
        return false;
    }
    const influxValue = metadata.frontmatter.influx;
    return influxValue === true || influxValue === 'true';
}

/**
 * Validates YAML property names according to YAML specification.
 * Valid property names must:
 * - Start with a letter or underscore
 * - Contain only letters, numbers, underscores, and hyphens
 *
 * @param properties - Array of property name strings to validate
 * @returns Object containing valid and invalid property arrays
 */
export function validateYamlPropertyNames(properties: string[] | null | undefined): ValidationResult {
    if (!Array.isArray(properties)) {
        return { valid: [], invalid: [] };
    }

    // Filter to non-empty strings
    const nonEmpty = properties.filter(prop => prop && typeof prop === 'string' && prop.trim().length > 0);

    // YAML property name regex
    const yamlPropertyRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const prop of nonEmpty) {
        if (yamlPropertyRegex.test(prop)) {
            valid.push(prop);
        } else {
            invalid.push(prop);
        }
    }

    return { valid, invalid };
}

/**
 * Checks if a given property name is a valid YAML property name.
 *
 * @param property - Property name to validate
 * @returns true if valid, false otherwise
 */
export function isValidYamlPropertyName(property: string): boolean {
    if (!property || typeof property !== 'string') {
        return false;
    }
    const yamlPropertyRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    return yamlPropertyRegex.test(property);
}

function evaluatePatternBehavior(
    filePath: string,
    behavior: ShowBehaviour,
    optInPatterns: string[],
    optOutPatterns: string[],
    matcher: (path: string, patterns: string[]) => boolean
): boolean {
    const patterns = behavior === 'OPT_IN' ? optInPatterns : optOutPatterns;
    const matched = matcher(filePath, patterns);
    return behavior === 'OPT_IN' ? matched : !matched;
}

/**
 * Determines if Influx should be shown for a file based on show behaviour and pattern matching.
 *
 * @param filePath - Path of the file to check
 * @param settings - Filter settings containing show behaviour and patterns
 * @returns true if Influx should be shown, false otherwise
 */
export function shouldShowInflux(filePath: string, settings: FilterSettings): boolean {
    return evaluatePatternBehavior(
        filePath,
        settings.showBehaviour,
        settings.inclusionPattern,
        settings.exclusionPattern,
        patternMatches
    );
}

/**
 * Determines if a source file should be included in backlinks.
 *
 * @param filePath - Path of the source file to check
 * @param settings - Filter settings containing source behaviour and patterns
 * @returns true if file should be included, false otherwise
 */
export function isIncludableSource(filePath: string, settings: FilterSettings): boolean {
    return evaluatePatternBehavior(
        filePath,
        settings.sourceBehaviour,
        settings.sourceInclusionPattern,
        settings.sourceExclusionPattern,
        patternMatches
    );
}

/**
 * Determines if Influx should be collapsed for a file.
 *
 * @param filePath - Path of the file to check
 * @param settings - Filter settings containing collapsed pattern
 * @returns true if Influx should be collapsed, false otherwise
 */
export function shouldCollapseInflux(filePath: string, settings: FilterSettings): boolean {
    return patternMatches(filePath, settings.collapsedPattern);
}

/**
 * Checks if a file path matches any of the provided regex patterns.
 *
 * @param filePath - Path to check
 * @param patterns - Array of regex pattern strings
 * @returns true if any pattern matches, false otherwise
 */
export function patternMatches(filePath: string, patterns: string[]): boolean {
    const nonEmptyPatterns = patterns.filter(p => p.length > 0);
    return nonEmptyPatterns.some(pattern => {
        try {
            return new RegExp(pattern).test(filePath);
        } catch {
            return false; // Invalid pattern doesn't match
        }
    });
}

/**
 * Creates a comparison function for sorting files based on settings.
 *
 * @param sortingAttribute - Attribute to sort by (ctime, mtime, or FILENAME)
 * @param sortingPrinciple - Order direction (NEWEST_FIRST or OLDEST_FIRST)
 * @returns Comparison function returning -1, 0, or 1
 */
export function createFileComparator(
    sortingAttribute: SortingAttribute,
    sortingPrinciple: SortingPrinciple
): (a: { file: { stat?: { ctime?: number; mtime?: number }; basename?: string } }, b: { file: { stat?: { ctime?: number; mtime?: number }; basename?: string } }) => number {
    // NEWEST_FIRST reverses natural order (newest first), OLDEST_FIRST keeps natural order (oldest first)
    const flip = sortingPrinciple === 'NEWEST_FIRST' ? -1 : 1;

    if (sortingAttribute === 'FILENAME') {
        return function compareByFilename(a, b): number {
            const aName = a.file.basename || '';
            const bName = b.file.basename || '';

            if (aName < bName) return -1 * flip;
            if (aName > bName) return 1 * flip;
            return 0;
        };
    }

    // Default to ctime or mtime
    const sortAttr = sortingAttribute === 'mtime' ? 'mtime' : 'ctime';

    return function compareByDate(a, b): number {
        const aTime = a.file.stat?.[sortAttr] || 0;
        const bTime = b.file.stat?.[sortAttr] || 0;

        if (aTime < bTime) return -1 * flip;
        if (aTime > bTime) return 1 * flip;
        return 0;
    };
}

/**
 * Creates a file comparator function based on sorting settings.
 * Works with InlinkingFile objects that have a `file` property.
 *
 * @param settings - Filter settings containing sort configuration
 * @returns Comparison function returning -1, 0, or 1
 */
export function createInlinkingFileComparator(settings: {
    sortingAttribute: SortingAttribute;
    sortingPrinciple: SortingPrinciple;
}): (a: { file: { stat?: { ctime?: number; mtime?: number }; basename?: string } }, b: { file: { stat?: { ctime?: number; mtime?: number }; basename?: string } }) => number {
    return createFileComparator(settings.sortingAttribute, settings.sortingPrinciple);
}

/**
 * Determines if Influx should be shown for a file based on show behaviour and pattern matching.
 * Supports dependency injection for custom pattern matching functions (e.g., with caching).
 *
 * @param filePath - Path of file to check
 * @param settings - Filter settings containing show behaviour and patterns
 * @param patternMatcher - Optional custom pattern matching function (defaults to patternMatches)
 * @param metadata - Optional file metadata to check for frontmatter key
 * @returns true if Influx should be shown, false otherwise
 */
export function shouldShowInfluxWithMatcher(
    filePath: string,
    settings: FilterSettings,
    patternMatcher?: (path: string, patterns: string[]) => boolean,
    metadata?: CachedMetadata | null | undefined
): boolean {
    const matcher = patternMatcher || patternMatches;
    // If frontmatter key is required, check that first (supersedes pattern matching)
    if (settings.requireInfluxFrontmatterKey === true) {
        return hasInfluxFrontmatterKey(metadata);
    }
    return evaluatePatternBehavior(
        filePath,
        settings.showBehaviour,
        settings.inclusionPattern,
        settings.exclusionPattern,
        matcher
    );
}

/**
 * Determines if a source file should be included in backlinks.
 * Supports dependency injection for custom pattern matching functions (e.g., with caching).
 *
 * @param filePath - Path of the source file to check
 * @param settings - Filter settings containing source behaviour and patterns
 * @param patternMatcher - Optional custom pattern matching function (defaults to patternMatches)
 * @returns true if file should be included, false otherwise
 */
export function isIncludableSourceWithMatcher(
    filePath: string,
    settings: FilterSettings,
    patternMatcher?: (path: string, patterns: string[]) => boolean
): boolean {
    const matcher = patternMatcher || patternMatches;
    return evaluatePatternBehavior(
        filePath,
        settings.sourceBehaviour,
        settings.sourceInclusionPattern,
        settings.sourceExclusionPattern,
        matcher
    );
}

/**
 * Determines if Influx should be collapsed for a file.
 * Supports dependency injection for custom pattern matching functions (e.g., with caching).
 *
 * @param filePath - Path of the file to check
 * @param settings - Filter settings containing collapsed pattern
 * @param patternMatcher - Optional custom pattern matching function (defaults to patternMatches)
 * @returns true if Influx should be collapsed, false otherwise
 */
export function shouldCollapseInfluxWithMatcher(
    filePath: string,
    settings: FilterSettings,
    patternMatcher?: (path: string, patterns: string[]) => boolean
): boolean {
    const matcher = patternMatcher || patternMatches;
    return matcher(filePath, settings.collapsedPattern);
}

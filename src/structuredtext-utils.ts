/**
 * Pure functions for StructuredText parsing
 * Extracted from StructuredText class to be easily testable
 */

import { NodeType } from './StructuredText';

// Constants
export const ORDERED_LISTITEM_REGEX = /^(\d+)[.] /gm;
export const TABLE_ROW_REGEX = /^\|(.+)\|(.*)\|/gm;
export const DASH_SIGN = '- ';
export const BULLET_SIGN = '* ';

/**
 * Finds the last non-empty element in a stack with optional offset
 * Extracted from StructuredText.parseText()
 */
export function lastNonEmptyElement(stack: string[], offset = 0): string | null {
    let ret = offset === 0 ? [...stack] : [...stack].slice(0, -offset);
    for (let i = ret.length - 1; i >= 0; i--) {
        if (!ret[i]) {
            ret = ret.slice(0, i);
        }
        else {
            return ret[i];
        }
    }
    return null;
}

/**
 * Checks if a string is an ordered list item and returns the ordinal number
 * Extracted from StructuredText.parseText()
 */
export function ifOrderedListItemReturnOrdinal(str: string): number | undefined {
    const matches = str.matchAll(ORDERED_LISTITEM_REGEX);
    for (const match of matches) {
        if (match[1]) {
            return Number(match[1]);
        }
    }
    return undefined;
}

/**
 * Parses a markdown table row and returns column count and whether it's a divider
 * Extracted from StructuredText.parseText()
 */
export function parseMarkdownTableRow(row: string): { cols: number; isDivider: boolean } | null {
    const match = row.match(TABLE_ROW_REGEX);
    if (!match) return null;

    let cols = 0;
    let isDivider = true;

    const cells = match[0]
        .slice(1, match[0].length - 1)
        .split('|');

    cells.forEach(cell => {
        if (cell.trim() !== '---') {
            isDivider = false;
        }
        cols += 1;
    });

    return {
        cols,
        isDivider
    };
}

/**
 * Checks if a trimmed line is a proper bullet (starts with '* ' or '- ')
 * Extracted from StructuredText.parseText()
 */
export function isProperBullet(trimmed: string): boolean {
    return [DASH_SIGN, BULLET_SIGN].includes(trimmed.substring(0, 2));
}

/**
 * Calculates leading indent by finding first non-whitespace character
 * Extracted from StructuredText.parseText()
 */
export function calculateLeadingIndent(line: string): number {
    return line.search(/\S|$/);
}

/**
 * Generates a zero-padded node ID from an index
 * Extracted from StructuredText.parseText()
 */
export function generateNodeId(index: number): string {
    return `${index}`.padStart(4, '0');
}

/**
 * Pads a string to 4 characters with leading zeros
 * Used for generating header IDs in tables
 */
export function padToNodeId(index: number): string {
    return `${index}`.padStart(4, '0');
}

/**
 * Strips the bullet marker from a trimmed line
 * Extracted from StructuredText.parseText()
 */
export function stripBulletMarker(trimmed: string): string {
    return trimmed.slice(2);
}

/**
 * Strips the ordinal and marker from an ordered list item
 * Extracted from StructuredText.parseText()
 */
export function stripOrdinalMarker(trimmed: string, ordinal: number): string {
    return trimmed.slice(String(ordinal).length + 2);
}

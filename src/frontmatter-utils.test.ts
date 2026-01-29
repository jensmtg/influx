// Unit tests for front matter utility functions
// These test the actual pure functions extracted from ApiAdapter

import { FrontmatterLinkCache, LinkCache } from 'obsidian';
import { ObsidianInfluxSettings } from './main';
import {
    validateFrontmatterProperties,
    shouldIncludeFrontmatterLinks,
    convertFrontmatterLinkToLinkCache,
    filterFrontmatterLinks,
    mergeConvertedLinksIntoBacklinks,
    processFrontmatterLinks
} from './frontmatter-utils';

// Helper functions for creating test data
const createMockFrontmatterLink = (key: string, link: string, displayText?: string): FrontmatterLinkCache => {
    return {
        key,
        link,
        displayText: displayText || link,
        original: `[[${link}]]`
    } as FrontmatterLinkCache;
};

const createMockBacklinks = (data: Map<string, LinkCache[]> | Record<string, LinkCache[]> = new Map()) => {
    return { data };
};

const createMockSettings = (settings: Partial<ObsidianInfluxSettings> = {}): ObsidianInfluxSettings => {
    return {
        liveUpdate: true,
        sortingPrinciple: "NEWEST_FIRST",
        sortingAttribute: "ctime",
        showBehaviour: "OPT_OUT",
        exclusionPattern: [],
        includePaths: [],
        excludePaths: [],
        includeFrontmatterLinks: false,
        frontmatterProperties: [],
        ...settings
    } as ObsidianInfluxSettings;
};

describe('Frontmatter Utils', () => {

    describe('validateFrontmatterProperties', () => {
        test('should filter out empty and invalid property names', () => {
            // Arrange
            const properties = [
                'related',
                '',
                'see_also',
                '   ',
                'references',
                null as any,
                undefined as any,
                'author'
            ];

            // Act
            const result = validateFrontmatterProperties(properties);

            // Assert
            expect(result).toEqual(['related', 'see_also', 'references', 'author']);
        });

        test('should handle empty properties array', () => {
            // Arrange
            const properties: string[] = [];

            // Act
            const result = validateFrontmatterProperties(properties);

            // Assert
            expect(result).toEqual([]);
        });

        test('should handle null/undefined properties array', () => {
            // Act & Assert
            expect(validateFrontmatterProperties(null as any)).toEqual([]);
            expect(validateFrontmatterProperties(undefined as any)).toEqual([]);
        });
    });

    describe('shouldIncludeFrontmatterLinks', () => {
        test('should return false when includeFrontmatterLinks is false', () => {
            // Arrange
            const settings = createMockSettings({ includeFrontmatterLinks: false });

            // Act
            const result = shouldIncludeFrontmatterLinks(settings);

            // Assert
            expect(result).toBe(false);
        });

        test('should return true when includeFrontmatterLinks is true', () => {
            // Arrange
            const settings = createMockSettings({ includeFrontmatterLinks: true });

            // Act
            const result = shouldIncludeFrontmatterLinks(settings);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe('convertFrontmatterLinkToLinkCache', () => {
        test('should convert valid front matter link to link cache', () => {
            // Arrange
            const fmLink = createMockFrontmatterLink('related', 'Test Note', 'Display Name');

            // Act
            const result = convertFrontmatterLinkToLinkCache(fmLink);

            // Assert
            expect(result).not.toBeNull();
            expect(result!.link).toBe('Test Note');
            expect(result!.displayText).toBe('Display Name');
            expect(result!.original).toBe('[[Test Note]]');
            expect(result!.position.start.line).toBe(-1); // Front matter sentinel
        });

        test('should use fallback values for missing displayText and original', () => {
            // Arrange
            const fmLink = {
                key: 'related',
                link: 'Test Note'
                // displayText and original missing
            } as FrontmatterLinkCache;

            // Act
            const result = convertFrontmatterLinkToLinkCache(fmLink);

            // Assert
            expect(result).not.toBeNull();
            expect(result!.displayText).toBe('Test Note'); // Fallback to link
            expect(result!.original).toBe('[[Test Note]]'); // Fallback to link format
        });

        test('should return null for invalid front matter links', () => {
            // Arrange
            const invalidLinks = [
                null,
                undefined,
                'not-an-object',
                { link: null },
                { link: '' },
                {} // Missing link
            ] as any[];

            // Act & Assert
            invalidLinks.forEach(link => {
                expect(convertFrontmatterLinkToLinkCache(link)).toBeNull();
            });
        });
    });

    describe('filterFrontmatterLinks', () => {
        test('should include all links when no properties specified', () => {
            // Arrange
            const frontmatterLinks = [
                createMockFrontmatterLink('related', 'Note 1'),
                createMockFrontmatterLink('author', 'Note 2'),
                createMockFrontmatterLink('see_also', 'Note 3')
            ];
            const targetProperties: string[] = [];

            // Act
            const result = filterFrontmatterLinks(frontmatterLinks, targetProperties);

            // Assert
            expect(result).toHaveLength(3);
            expect(result.map(l => l.link)).toEqual(['Note 1', 'Note 2', 'Note 3']);
        });

        test('should filter links when properties are specified', () => {
            // Arrange
            const frontmatterLinks = [
                createMockFrontmatterLink('related', 'Note 1'),
                createMockFrontmatterLink('author', 'Note 2'),
                createMockFrontmatterLink('see_also', 'Note 3')
            ];
            const targetProperties = ['related', 'see_also'];

            // Act
            const result = filterFrontmatterLinks(frontmatterLinks, targetProperties);

            // Assert
            expect(result).toHaveLength(2);
            expect(result.map(l => l.link)).toEqual(['Note 1', 'Note 3']);
        });

        test('should handle links without key property', () => {
            // Arrange
            const frontmatterLinks = [
                createMockFrontmatterLink('related', 'Note 1'),
                { link: 'Note 2', displayText: 'Note 2' } as FrontmatterLinkCache, // Missing key
                createMockFrontmatterLink('see_also', 'Note 3')
            ];
            const targetProperties = ['related', 'see_also'];

            // Act
            const result = filterFrontmatterLinks(frontmatterLinks, targetProperties);

            // Assert
            expect(result).toHaveLength(2);
            expect(result.map(l => l.link)).toEqual(['Note 1', 'Note 3']);
        });

        test('should handle null/undefined frontmatter links array', () => {
            // Act & Assert
            expect(filterFrontmatterLinks(null as any, [])).toEqual([]);
            expect(filterFrontmatterLinks(undefined as any, [])).toEqual([]);
        });
    });

    describe('mergeConvertedLinksIntoBacklinks', () => {
        test('should merge links into Map backlinks', () => {
            // Arrange
            const backlinks = createMockBacklinks(new Map([
                ['Existing Note', [{ link: 'Existing Note' } as LinkCache]]
            ]));
            const convertedLinks = [
                { link: 'New Note 1' } as LinkCache,
                { link: 'New Note 2' } as LinkCache
            ];

            // Act
            mergeConvertedLinksIntoBacklinks(backlinks, convertedLinks);

            // Assert
            expect((backlinks.data as Map<string, LinkCache[]>).get('Existing Note')).toHaveLength(1);
            expect((backlinks.data as Map<string, LinkCache[]>).get('New Note 1')).toHaveLength(1);
            expect((backlinks.data as Map<string, LinkCache[]>).get('New Note 2')).toHaveLength(1);
        });

        test('should merge links into Object backlinks', () => {
            // Arrange
            const backlinks = createMockBacklinks({
                'Existing Note': [{ link: 'Existing Note' } as LinkCache]
            } as { [key: string]: LinkCache[] });
            const convertedLinks = [
                { link: 'New Note' } as LinkCache
            ];

            // Act
            mergeConvertedLinksIntoBacklinks(backlinks, convertedLinks);

            // Assert
            expect((backlinks.data as { [key: string]: LinkCache[] })['Existing Note']).toHaveLength(1);
            expect((backlinks.data as { [key: string]: LinkCache[] })['New Note']).toHaveLength(1);
        });

        test('should handle multiple links to same destination', () => {
            // Arrange
            const backlinks = createMockBacklinks(new Map());
            const convertedLinks = [
                { link: 'Same Note' } as LinkCache,
                { link: 'Same Note' } as LinkCache
            ];

            // Act
            mergeConvertedLinksIntoBacklinks(backlinks, convertedLinks);

            // Assert
            expect((backlinks.data as Map<string, LinkCache[]>).get('Same Note')).toHaveLength(2);
        });

        test('should handle null/undefined inputs gracefully', () => {
            // Arrange
            const backlinks = createMockBacklinks(new Map());
            const validLinks = [{ link: 'Test Note' } as LinkCache];

            // Act & Assert - Should not throw
            expect(() => {
                mergeConvertedLinksIntoBacklinks(null as any, validLinks);
            }).not.toThrow();

            expect(() => {
                mergeConvertedLinksIntoBacklinks(backlinks, null as any);
            }).not.toThrow();

            expect(() => {
                mergeConvertedLinksIntoBacklinks(backlinks, undefined as any);
            }).not.toThrow();
        });
    });

    describe('processFrontmatterLinks', () => {
        test('should process complete pipeline when enabled', () => {
            // Arrange
            const backlinks = createMockBacklinks(new Map([
                ['Existing Note', [{ link: 'Existing Note' } as LinkCache]]
            ]));
            const frontmatterLinks = [
                createMockFrontmatterLink('related', 'Front Matter Note 1'),
                createMockFrontmatterLink('author', 'Front Matter Note 2')
            ];
            const settings = createMockSettings({
                includeFrontmatterLinks: true,
                frontmatterProperties: ['related'] // Only include 'related'
            });

            // Act
            const result = processFrontmatterLinks(backlinks, frontmatterLinks, settings);

            // Assert
            expect((result.data as Map<string, LinkCache[]>).get('Existing Note')).toHaveLength(1);
            expect((result.data as Map<string, LinkCache[]>).get('Front Matter Note 1')).toHaveLength(1);
            expect((result.data as Map<string, LinkCache[]>).get('Front Matter Note 2')).toBeUndefined(); // Filtered out
        });

        test('should return unchanged backlinks when disabled', () => {
            // Arrange
            const backlinks = createMockBacklinks(new Map([
                ['Existing Note', [{ link: 'Existing Note' } as LinkCache]]
            ]));
            const frontmatterLinks = [
                createMockFrontmatterLink('related', 'Front Matter Note 1')
            ];
            const settings = createMockSettings({
                includeFrontmatterLinks: false // Disabled
            });

            // Act
            const result = processFrontmatterLinks(backlinks, frontmatterLinks, settings);

            // Assert
            expect((result.data as Map<string, LinkCache[]>).get('Existing Note')).toHaveLength(1);
            expect((result.data as Map<string, LinkCache[]>).get('Front Matter Note 1')).toBeUndefined(); // Not processed
        });

        test('should include all links when no properties specified', () => {
            // Arrange
            const backlinks = createMockBacklinks(new Map());
            const frontmatterLinks = [
                createMockFrontmatterLink('related', 'Note 1'),
                createMockFrontmatterLink('author', 'Note 2')
            ];
            const settings = createMockSettings({
                includeFrontmatterLinks: true,
                frontmatterProperties: [] // Include all
            });

            // Act
            const result = processFrontmatterLinks(backlinks, frontmatterLinks, settings);

            // Assert
            expect((result.data as Map<string, LinkCache[]>).get('Note 1')).toHaveLength(1);
            expect((result.data as Map<string, LinkCache[]>).get('Note 2')).toHaveLength(1);
        });

        test('should handle errors gracefully', () => {
            // Arrange
            const backlinks = createMockBacklinks(new Map());
            const settings = createMockSettings({ includeFrontmatterLinks: true });

            // Act & Assert - Should not throw even with malformed data
            expect(() => {
                const result = processFrontmatterLinks(backlinks, null as any, settings);
                expect(result).toBe(backlinks); // Should return unchanged
            }).not.toThrow();
        });
    });
});

// Unit tests for link utility functions
// Tests the actual pure functions extracted from ApiAdapter

import { LinkCache } from 'obsidian';
import { 
    extractLinkName,
    compareLinkName,
    processTitleHTML,
    filterLinksByBasename
} from './link-utils';

// Helper function to create mock LinkCache
const createMockLink = (link: string): LinkCache => ({
    link,
    displayText: link,
    position: {
        start: { line: 1, col: 1, offset: 0 },
        end: { line: 1, col: 1 + link.length, offset: link.length }
    },
    original: `[[${link}]]`
});

describe('Link Utils', () => {

    describe('extractLinkName', () => {
        test('should extract simple filename', () => {
            // Arrange
            const link = createMockLink('Test Note');

            // Act
            const result = extractLinkName(link);

            // Assert
            expect(result).toBe('test note');
        });

        test('should handle file paths with folders', () => {
            // Arrange
            const link = createMockLink('folder/subfolder/Test Note');

            // Act
            const result = extractLinkName(link);

            // Assert
            expect(result).toBe('test note');
        });

        test('should remove block references', () => {
            // Arrange
            const link = createMockLink('Test Note#^block-id');

            // Act
            const result = extractLinkName(link);

            // Assert
            expect(result).toBe('test note');
        });

        test('should remove heading references', () => {
            // Arrange
            const link = createMockLink('Test Note#heading');

            // Act
            const result = extractLinkName(link);

            // Assert
            expect(result).toBe('test note');
        });

        test('should remove .md extension', () => {
            // Arrange
            const link = createMockLink('Test Note.md');

            // Act
            const result = extractLinkName(link);

            // Assert
            expect(result).toBe('test note');
        });

        test('should handle complex paths with multiple separators', () => {
            // Arrange
            const link = createMockLink('docs/notes/Test Note.md#heading^block');

            // Act
            const result = extractLinkName(link);

            // Assert
            expect(result).toBe('test note');
        });

        test('should convert to lowercase', () => {
            // Arrange
            const link = createMockLink('TEST NOTE');

            // Act
            const result = extractLinkName(link);

            // Assert
            expect(result).toBe('test note');
        });
    });

    describe('compareLinkName', () => {
        test('should match exact basename', () => {
            // Arrange
            const link = createMockLink('Test Note');
            const basename = 'Test Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });

        test('should match case-insensitive', () => {
            // Arrange
            const link = createMockLink('test note');
            const basename = 'TEST NOTE';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });

        test('should not match different names', () => {
            // Arrange
            const link = createMockLink('Test Note');
            const basename = 'Different Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(false);
        });

        test('should handle complex link paths', () => {
            // Arrange
            const link = createMockLink('folder/Test Note.md#heading');
            const basename = 'Test Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe('processTitleHTML', () => {
        test('should remove paragraph tags', () => {
            // Arrange
            const html = '<p>Test Title</p>';

            // Act
            const result = processTitleHTML(html);

            // Assert
            expect(result).toBe('Test Title');
        });

        test('should remove leading underscore after p tag removal', () => {
            // Arrange
            const html = '<p>_Test Title</p>';

            // Act
            const result = processTitleHTML(html);

            // Assert
            expect(result).toBe('Test Title');
        });

        test('should handle multiple paragraph tags', () => {
            // Arrange
            const html = '<p>First</p><p>Second</p>';

            // Act
            const result = processTitleHTML(html);

            // Assert
            expect(result).toBe('FirstSecond');
        });

        test('should handle nested HTML', () => {
            // Arrange
            const html = '<p><strong>Bold Title</strong></p>';

            // Act
            const result = processTitleHTML(html);

            // Assert
            expect(result).toBe('<strong>Bold Title</strong>');
        });

        test('should handle empty string', () => {
            // Arrange
            const html = '';

            // Act
            const result = processTitleHTML(html);

            // Assert
            expect(result).toBe('');
        });

        test('should handle string without paragraph tags', () => {
            // Arrange
            const html = 'Plain Title';

            // Act
            const result = processTitleHTML(html);

            // Assert
            expect(result).toBe('Plain Title');
        });
    });

    describe('filterLinksByBasename', () => {
        test('should filter links that match basename', () => {
            // Arrange
            const links = [
                createMockLink('Test Note'),
                createMockLink('Different Note'),
                createMockLink('Test Note.md#heading'),
                createMockLink('folder/Test Note')
            ];
            const basename = 'Test Note';

            // Act
            const result = filterLinksByBasename(links, basename);

            // Assert
            expect(result).toHaveLength(3); // All Test Note variations
            expect(result.every(link => link.link.includes('Test Note'))).toBe(true);
        });

        test('should return empty array when no links match', () => {
            // Arrange
            const links = [
                createMockLink('Note A'),
                createMockLink('Note B'),
                createMockLink('Note C')
            ];
            const basename = 'Different Note';

            // Act
            const result = filterLinksByBasename(links, basename);

            // Assert
            expect(result).toHaveLength(0);
        });

        test('should handle empty links array', () => {
            // Arrange
            const links: LinkCache[] = [];
            const basename = 'Test Note';

            // Act
            const result = filterLinksByBasename(links, basename);

            // Assert
            expect(result).toHaveLength(0);
        });

        test('should be case-insensitive', () => {
            // Arrange
            const links = [
                createMockLink('test note'),
                createMockLink('TEST NOTE'),
                createMockLink('Test Note')
            ];
            const basename = 'test note';

            // Act
            const result = filterLinksByBasename(links, basename);

            // Assert
            expect(result).toHaveLength(3); // All should match
        });
    });
});

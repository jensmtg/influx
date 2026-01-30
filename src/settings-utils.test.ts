// Unit tests for settings utility functions
// Tests the actual pure functions extracted from settings.tsx and apiAdapter.tsx

import { LinkCache } from 'obsidian';
import {
    validateYamlPropertyNames,
    isValidYamlPropertyName,
    shouldShowInflux,
    isIncludableSource,
    shouldCollapseInflux,
    patternMatches,
    createFileComparator,
    compareLinkName,
    shouldShowInfluxWithMatcher,
    isIncludableSourceWithMatcher,
    shouldCollapseInfluxWithMatcher,
    createInlinkingFileComparator,
    type FilterSettings
} from './settings-utils';

// Helper function to create test settings
const createTestSettings = (overrides: Partial<FilterSettings> = {}): FilterSettings => ({
    showBehaviour: 'OPT_OUT',
    inclusionPattern: [],
    exclusionPattern: [],
    sourceBehaviour: 'OPT_OUT',
    sourceInclusionPattern: [],
    sourceExclusionPattern: [],
    collapsedPattern: [],
    ...overrides
});

// Helper function to create mock file object
const createMockFile = (path: string, ctime = 1000, mtime = 1000, basename?: string) => ({
    file: {
        stat: { ctime, mtime },
        basename: basename || path.split('/').pop()
    }
});

describe('Settings Utils', () => {

    describe('validateYamlPropertyNames', () => {
        test('should return all valid properties', () => {
            // Arrange
            const properties = ['related', 'author', 'see_also', 'my_property', 'Test-123'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual(['related', 'author', 'see_also', 'my_property', 'Test-123']);
            expect(result.invalid).toEqual([]);
        });

        test('should identify all invalid properties', () => {
            // Arrange
            const properties = ['123invalid', 'invalid name', 'test.property', ''];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual(['123invalid', 'invalid name', 'test.property']);
        });

        test('should handle mixed valid and invalid properties', () => {
            // Arrange
            const properties = ['valid', '123invalid', 'another_valid', 'test property', 'author'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual(['valid', 'another_valid', 'author']);
            expect(result.invalid).toEqual(['123invalid', 'test property']);
        });

        test('should handle empty array', () => {
            // Arrange
            const properties: string[] = [];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual([]);
        });

        test('should handle null input', () => {
            // Act
            const result = validateYamlPropertyNames(null as any);

            // Assert
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual([]);
        });

        test('should handle undefined input', () => {
            // Act
            const result = validateYamlPropertyNames(undefined as any);

            // Assert
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual([]);
        });

        test('should filter out empty strings', () => {
            // Arrange
            const properties = ['valid', '', '   ', 'another_valid'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual(['valid', 'another_valid']);
            expect(result.invalid).toEqual([]);
        });

        test('should filter out non-string values', () => {
            // Arrange
            const properties = ['valid', null as any, undefined as any, 'another_valid'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual(['valid', 'another_valid']);
            expect(result.invalid).toEqual([]);
        });

        test('should accept properties starting with underscore', () => {
            // Arrange
            const properties = ['_private', '_test_123', '__init__'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual(['_private', '_test_123', '__init__']);
            expect(result.invalid).toEqual([]);
        });

        test('should accept properties with hyphens', () => {
            // Arrange
            const properties = ['test-property', 'my-custom-field', 'a-b-c'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual(['test-property', 'my-custom-field', 'a-b-c']);
            expect(result.invalid).toEqual([]);
        });

        test('should reject properties starting with numbers', () => {
            // Arrange
            const properties = ['1st', '2prop', '123_test'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual(['1st', '2prop', '123_test']);
        });

        test('should reject properties with spaces', () => {
            // Arrange
            const properties = ['test property', 'my prop', 'with spaces'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual(['test property', 'my prop', 'with spaces']);
        });

        test('should reject properties with special characters', () => {
            // Arrange
            const properties = ['test.property', 'test,property', 'test$property'];

            // Act
            const result = validateYamlPropertyNames(properties);

            // Assert
            expect(result.valid).toEqual([]);
            expect(result.invalid).toEqual(['test.property', 'test,property', 'test$property']);
        });
    });

    describe('isValidYamlPropertyName', () => {
        test('should return true for valid property names', () => {
            // Arrange
            const validNames = ['test', 'test_property', 'test-property', 'Test123', '_private', '__init__'];

            // Act & Assert
            validNames.forEach(name => {
                expect(isValidYamlPropertyName(name)).toBe(true);
            });
        });

        test('should return false for invalid property names', () => {
            // Arrange
            const invalidNames = ['123test', 'test property', 'test.property', '', 'test$prop'];

            // Act & Assert
            invalidNames.forEach(name => {
                expect(isValidYamlPropertyName(name)).toBe(false);
            });
        });

        test('should return false for null', () => {
            // Act
            const result = isValidYamlPropertyName(null as any);

            // Assert
            expect(result).toBe(false);
        });

        test('should return false for undefined', () => {
            // Act
            const result = isValidYamlPropertyName(undefined as any);

            // Assert
            expect(result).toBe(false);
        });

        test('should return false for non-string types', () => {
            // Act & Assert
            expect(isValidYamlPropertyName(123 as any)).toBe(false);
            expect(isValidYamlPropertyName({} as any)).toBe(false);
            expect(isValidYamlPropertyName([] as any)).toBe(false);
        });
    });

    describe('shouldShowInflux', () => {
        test('should return true for OPT_IN when pattern matches', () => {
            // Arrange
            const settings = createTestSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Notes/']
            });

            // Act
            const result = shouldShowInflux('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });

        test('should return false for OPT_IN when pattern does not match', () => {
            // Arrange
            const settings = createTestSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Notes/']
            });

            // Act
            const result = shouldShowInflux('/Journal/Test.md', settings);

            // Assert
            expect(result).toBe(false);
        });

        test('should return false for OPT_IN with empty patterns', () => {
            // Arrange
            const settings = createTestSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: []
            });

            // Act
            const result = shouldShowInflux('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(false);
        });

        test('should return false for OPT_OUT when pattern matches', () => {
            // Arrange
            const settings = createTestSettings({
                showBehaviour: 'OPT_OUT',
                exclusionPattern: ['/Journal/']
            });

            // Act
            const result = shouldShowInflux('/Journal/Test.md', settings);

            // Assert
            expect(result).toBe(false);
        });

        test('should return true for OPT_OUT when pattern does not match', () => {
            // Arrange
            const settings = createTestSettings({
                showBehaviour: 'OPT_OUT',
                exclusionPattern: ['/Journal/']
            });

            // Act
            const result = shouldShowInflux('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });

        test('should return true for OPT_OUT with empty patterns', () => {
            // Arrange
            const settings = createTestSettings({
                showBehaviour: 'OPT_OUT',
                exclusionPattern: []
            });

            // Act
            const result = shouldShowInflux('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe('isIncludableSource', () => {
        test('should return true for OPT_IN when pattern matches', () => {
            // Arrange
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_IN',
                sourceInclusionPattern: ['/Notes/']
            });

            // Act
            const result = isIncludableSource('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });

        test('should return false for OPT_IN when pattern does not match', () => {
            // Arrange
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_IN',
                sourceInclusionPattern: ['/Notes/']
            });

            // Act
            const result = isIncludableSource('/Journal/Test.md', settings);

            // Assert
            expect(result).toBe(false);
        });

        test('should return false for OPT_OUT when pattern matches', () => {
            // Arrange
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceExclusionPattern: ['/Journal/']
            });

            // Act
            const result = isIncludableSource('/Journal/Test.md', settings);

            // Assert
            expect(result).toBe(false);
        });

        test('should return true for OPT_OUT when pattern does not match', () => {
            // Arrange
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceExclusionPattern: ['/Journal/']
            });

            // Act
            const result = isIncludableSource('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe('shouldCollapseInflux', () => {
        test('should return true when pattern matches', () => {
            // Arrange
            const settings = createTestSettings({
                collapsedPattern: ['/Journal/']
            });

            // Act
            const result = shouldCollapseInflux('/Journal/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });

        test('should return false when pattern does not match', () => {
            // Arrange
            const settings = createTestSettings({
                collapsedPattern: ['/Journal/']
            });

            // Act
            const result = shouldCollapseInflux('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(false);
        });

        test('should return false for empty patterns', () => {
            // Arrange
            const settings = createTestSettings({
                collapsedPattern: []
            });

            // Act
            const result = shouldCollapseInflux('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('patternMatches', () => {
        test('should match simple pattern', () => {
            // Act & Assert
            expect(patternMatches('/Notes/Test.md', ['/Notes/'])).toBe(true);
            expect(patternMatches('/Journal/Test.md', ['/Notes/'])).toBe(false);
        });

        test('should match regex pattern', () => {
            // Act & Assert
            expect(patternMatches('/Notes/Test.md', ['/.*Notes/'])).toBe(true);
            expect(patternMatches('/Journal/Test.md', ['/.*Notes/'])).toBe(false);
        });

        test('should handle multiple patterns', () => {
            // Arrange
            const patterns = ['/Notes/', '/Journal/'];

            // Act & Assert
            expect(patternMatches('/Notes/Test.md', patterns)).toBe(true);
            expect(patternMatches('/Journal/Test.md', patterns)).toBe(true);
            expect(patternMatches('/Tasks/Test.md', patterns)).toBe(false);
        });

        test('should filter empty patterns', () => {
            // Act
            const result = patternMatches('/Notes/Test.md', ['', '/Notes/', '   ']);

            // Assert
            expect(result).toBe(true);
        });

        test('should return false for all empty patterns', () => {
            // Act
            const result = patternMatches('/Notes/Test.md', ['', '   ']);

            // Assert
            expect(result).toBe(false);
        });

        test('should handle invalid regex patterns gracefully', () => {
            // Act - Unclosed bracket should cause syntax error
            const result = patternMatches('/Notes/Test.md', ['[(invalid']);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('createFileComparator', () => {
        const fileA = createMockFile('/A.md', 1000, 1000, 'A');
        const fileB = createMockFile('/B.md', 2000, 2000, 'B');

        describe('by ctime with NEWEST_FIRST', () => {
            test('should sort newest first', () => {
                // Arrange
                const comparator = createFileComparator('ctime', 'NEWEST_FIRST');

                // Act
                const resultAB = comparator(fileA, fileB);
                const resultBA = comparator(fileB, fileA);

                // Assert - With NEWEST_FIRST, B (newer) should come before A
                expect(resultAB).toBe(1);  // A after B (A is older, should come after)
                expect(resultBA).toBe(-1); // B before A (B is newer, should come before)
            });
        });

        describe('by ctime with OLDEST_FIRST', () => {
            test('should sort oldest first', () => {
                // Arrange
                const comparator = createFileComparator('ctime', 'OLDEST_FIRST');

                // Act
                const resultAB = comparator(fileA, fileB);
                const resultBA = comparator(fileB, fileA);

                // Assert - With OLDEST_FIRST, A (older) should come before B
                expect(resultAB).toBe(-1); // A before B (A is older, should come before)
                expect(resultBA).toBe(1);  // B after A (B is newer, should come after)
            });
        });

        describe('by FILENAME', () => {
            test('should sort by filename with NEWEST_FIRST', () => {
                // Arrange
                const comparator = createFileComparator('FILENAME', 'NEWEST_FIRST');

                // Act
                const resultAB = comparator(fileA, fileB);

                // Assert
                expect(resultAB).toBe(1); // A after B (reverse alphabetical)
            });

            test('should sort by filename with OLDEST_FIRST', () => {
                // Arrange
                const comparator = createFileComparator('FILENAME', 'OLDEST_FIRST');

                // Act
                const resultAB = comparator(fileA, fileB);

                // Assert
                expect(resultAB).toBe(-1); // A before B (alphabetical)
            });
        });

        describe('equal values', () => {
            test('should return 0 for equal ctime', () => {
                // Arrange
                const fileA2 = createMockFile('/A.md', 1000, 1000, 'A');
                const comparator = createFileComparator('ctime', 'NEWEST_FIRST');

                // Act
                const result = comparator(fileA, fileA2);

                // Assert
                expect(result).toBe(0);
            });

            test('should return 0 for equal filename', () => {
                // Arrange
                const fileA2 = createMockFile('/A.md', 1000, 1000, 'A');
                const comparator = createFileComparator('FILENAME', 'NEWEST_FIRST');

                // Act
                const result = comparator(fileA, fileA2);

                // Assert
                expect(result).toBe(0);
            });
        });
    });

    describe('compareLinkName', () => {
        test('should match exact basename', () => {
            // Arrange
            const link = { link: 'Test Note' } as LinkCache;
            const basename = 'Test Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });

        test('should match case-insensitive', () => {
            // Arrange
            const link = { link: 'test note' } as LinkCache;
            const basename = 'TEST NOTE';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });

        test('should not match different names', () => {
            // Arrange
            const link = { link: 'Test Note' } as LinkCache;
            const basename = 'Different Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(false);
        });

        test('should handle complex link paths', () => {
            // Arrange
            const link = { link: 'folder/Test Note.md#heading' } as LinkCache;
            const basename = 'Test Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });

        test('should handle block references', () => {
            // Arrange
            const link = { link: 'Test Note#^block-id' } as LinkCache;
            const basename = 'Test Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });

        test('should remove .md extension', () => {
            // Arrange
            const link = { link: 'Test Note.md' } as LinkCache;
            const basename = 'Test Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });

        test('should handle folder paths', () => {
            // Arrange
            const link = { link: 'folder/subfolder/Test Note' } as LinkCache;
            const basename = 'Test Note';

            // Act
            const result = compareLinkName(link, basename);

            // Assert
            expect(result).toBe(true);
        });
    });

    describe('shouldShowInfluxWithMatcher', () => {
        test('should use default pattern matcher when none provided', () => {
            // Arrange
            const settings = createTestSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Notes/']
            });

            // Act
            const result = shouldShowInfluxWithMatcher('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });

        test('should use injected pattern matcher', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(true);
            const settings = createTestSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Notes/']
            });

            // Act
            const result = shouldShowInfluxWithMatcher('/Any/File.md', settings, mockMatcher);

            // Assert
            expect(mockMatcher).toHaveBeenCalledWith('/Any/File.md', ['/Notes/']);
            expect(result).toBe(true);
        });

        test('should handle OPT_IN with custom matcher returning true', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(true);
            const settings = createTestSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Special/']
            });

            // Act
            const result = shouldShowInfluxWithMatcher('/Random/File.md', settings, mockMatcher);

            // Assert
            expect(result).toBe(true); // OPT_IN shows when matched
        });

        test('should handle OPT_IN with custom matcher returning false', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(false);
            const settings = createTestSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Notes/']
            });

            // Act
            const result = shouldShowInfluxWithMatcher('/Notes/Test.md', settings, mockMatcher);

            // Assert
            expect(result).toBe(false); // OPT_IN hides when not matched
        });

        test('should handle OPT_OUT with custom matcher returning true', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(true);
            const settings = createTestSettings({
                showBehaviour: 'OPT_OUT',
                exclusionPattern: ['/Journal/']
            });

            // Act
            const result = shouldShowInfluxWithMatcher('/Journal/Test.md', settings, mockMatcher);

            // Assert
            expect(result).toBe(false); // OPT_OUT hides when matched
        });

        test('should handle OPT_OUT with custom matcher returning false', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(false);
            const settings = createTestSettings({
                showBehaviour: 'OPT_OUT',
                exclusionPattern: ['/Journal/']
            });

            // Act
            const result = shouldShowInfluxWithMatcher('/Notes/Test.md', settings, mockMatcher);

            // Assert
            expect(result).toBe(true); // OPT_OUT shows when not matched
        });
    });

    describe('isIncludableSourceWithMatcher', () => {
        test('should use default pattern matcher when none provided', () => {
            // Arrange
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_IN',
                sourceInclusionPattern: ['/Notes/']
            });

            // Act
            const result = isIncludableSourceWithMatcher('/Notes/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });

        test('should use injected pattern matcher', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(true);
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_IN',
                sourceInclusionPattern: ['/Notes/']
            });

            // Act
            const result = isIncludableSourceWithMatcher('/Any/File.md', settings, mockMatcher);

            // Assert
            expect(mockMatcher).toHaveBeenCalledWith('/Any/File.md', ['/Notes/']);
            expect(result).toBe(true);
        });

        test('should handle OPT_IN with custom matcher returning true', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(true);
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_IN',
                sourceInclusionPattern: ['/Special/']
            });

            // Act
            const result = isIncludableSourceWithMatcher('/Random/File.md', settings, mockMatcher);

            // Assert
            expect(result).toBe(true); // OPT_IN includes when matched
        });

        test('should handle OPT_OUT with custom matcher returning true', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(true);
            const settings = createTestSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceExclusionPattern: ['/Journal/']
            });

            // Act
            const result = isIncludableSourceWithMatcher('/Journal/Test.md', settings, mockMatcher);

            // Assert
            expect(result).toBe(false); // OPT_OUT excludes when matched
        });
    });

    describe('shouldCollapseInfluxWithMatcher', () => {
        test('should use default pattern matcher when none provided', () => {
            // Arrange
            const settings = createTestSettings({
                collapsedPattern: ['/Journal/']
            });

            // Act
            const result = shouldCollapseInfluxWithMatcher('/Journal/Test.md', settings);

            // Assert
            expect(result).toBe(true);
        });

        test('should use injected pattern matcher', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(true);
            const settings = createTestSettings({
                collapsedPattern: ['/Journal/']
            });

            // Act
            const result = shouldCollapseInfluxWithMatcher('/Any/File.md', settings, mockMatcher);

            // Assert
            expect(mockMatcher).toHaveBeenCalledWith('/Any/File.md', ['/Journal/']);
            expect(result).toBe(true);
        });

        test('should return false when matcher returns false', () => {
            // Arrange
            const mockMatcher = jest.fn().mockReturnValue(false);
            const settings = createTestSettings({
                collapsedPattern: ['/Journal/']
            });

            // Act
            const result = shouldCollapseInfluxWithMatcher('/Notes/Test.md', settings, mockMatcher);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('createInlinkingFileComparator', () => {
        test('should create comparator for FILENAME with NEWEST_FIRST', () => {
            // Arrange
            const settings = {
                sortingAttribute: 'FILENAME' as const,
                sortingPrinciple: 'NEWEST_FIRST' as const
            };
            const fileA = createMockFile('/A.md', 1000, 1000, 'A');
            const fileB = createMockFile('/B.md', 2000, 2000, 'B');

            // Act
            const comparator = createInlinkingFileComparator(settings);
            const result = comparator(fileA, fileB);

            // Assert - reverse alphabetical with NEWEST_FIRST (flip = -1)
            expect(result).toBe(1); // A comes after B (reverse alphabetical)
        });

        test('should create comparator for FILENAME with OLDEST_FIRST', () => {
            // Arrange
            const settings = {
                sortingAttribute: 'FILENAME' as const,
                sortingPrinciple: 'OLDEST_FIRST' as const
            };
            const fileA = createMockFile('/A.md', 1000, 1000, 'A');
            const fileB = createMockFile('/B.md', 2000, 2000, 'B');

            // Act
            const comparator = createInlinkingFileComparator(settings);
            const result = comparator(fileA, fileB);

            // Assert - alphabetical order with OLDEST_FIRST (flip = 1)
            expect(result).toBe(-1); // A comes before B alphabetically
        });

        test('should create comparator for ctime with NEWEST_FIRST', () => {
            // Arrange
            const settings = {
                sortingAttribute: 'ctime' as const,
                sortingPrinciple: 'NEWEST_FIRST' as const
            };
            const fileA = createMockFile('/A.md', 1000, 1000, 'A');
            const fileB = createMockFile('/B.md', 2000, 2000, 'B');

            // Act
            const comparator = createInlinkingFileComparator(settings);
            const resultAB = comparator(fileA, fileB);
            const resultBA = comparator(fileB, fileA);

            // Assert - With NEWEST_FIRST, B (newer) should come before A
            expect(resultAB).toBe(1);  // A after B (A is older)
            expect(resultBA).toBe(-1); // B before A (B is newer)
        });

        test('should create comparator for mtime with OLDEST_FIRST', () => {
            // Arrange
            const settings = {
                sortingAttribute: 'mtime' as const,
                sortingPrinciple: 'OLDEST_FIRST' as const
            };
            const fileA = createMockFile('/A.md', 1000, 2000, 'A'); // mtime 2000 (newer)
            const fileB = createMockFile('/B.md', 1000, 1000, 'B'); // mtime 1000 (older)

            // Act
            const comparator = createInlinkingFileComparator(settings);
            const resultAB = comparator(fileA, fileB);
            const resultBA = comparator(fileB, fileA);

            // Assert - With OLDEST_FIRST by mtime, B (older mtime) should come before A
            expect(resultAB).toBe(1);  // A after B (A has newer mtime)
            expect(resultBA).toBe(-1); // B before A (B has older mtime)
        });

        test('should return 0 for equal filenames', () => {
            // Arrange
            const settings = {
                sortingAttribute: 'FILENAME' as const,
                sortingPrinciple: 'NEWEST_FIRST' as const
            };
            const fileA = createMockFile('/A.md', 1000, 1000, 'Same');
            const fileB = createMockFile('/B.md', 2000, 2000, 'Same');

            // Act
            const comparator = createInlinkingFileComparator(settings);
            const result = comparator(fileA, fileB);

            // Assert
            expect(result).toBe(0);
        });
    });
});

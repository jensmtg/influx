import { CachedMetadata } from 'obsidian';
import {
    validateYamlPropertyNames,
    isValidYamlPropertyName,
    hasInfluxFrontmatterKey,
    shouldShowInflux,
    isIncludableSource,
    shouldCollapseInflux,
    patternMatches,
    createFileComparator,
    createInlinkingFileComparator,
    shouldShowInfluxWithMatcher,
    isIncludableSourceWithMatcher,
    shouldCollapseInfluxWithMatcher,
    type FilterSettings,
} from '../src/settings-utils';

const createSettings = (overrides: Partial<FilterSettings> = {}): FilterSettings => ({
    showBehaviour: 'OPT_OUT',
    inclusionPattern: [],
    exclusionPattern: [],
    sourceBehaviour: 'OPT_OUT',
    sourceInclusionPattern: [],
    sourceExclusionPattern: [],
    collapsedPattern: [],
    ...overrides,
});

const createMockFile = (basename: string, ctime: number, mtime: number) => ({
    file: { basename, stat: { ctime, mtime } },
});

describe('settings-utils', () => {
    describe('yaml property validation', () => {
        test('validateYamlPropertyNames keeps valid entries and reports invalid entries', () => {
            const result = validateYamlPropertyNames([
                'valid_name',
                'with-hyphen',
                '1invalid',
                'invalid space',
                '',
                '   ',
                undefined as any,
            ]);

            expect(result).toEqual({
                valid: ['valid_name', 'with-hyphen'],
                invalid: ['1invalid', 'invalid space'],
            });
        });

        test('validateYamlPropertyNames returns empty groups for non-array input', () => {
            expect(validateYamlPropertyNames(null as any)).toEqual({ valid: [], invalid: [] });
            expect(validateYamlPropertyNames(undefined as any)).toEqual({ valid: [], invalid: [] });
        });

        test.each([
            ['alpha', true],
            ['my-key', true],
            ['9start', false],
            ['', false],
        ])('isValidYamlPropertyName(%p) => %p', (input, expected) => {
            expect(isValidYamlPropertyName(input as any)).toBe(expected);
        });
    });

    describe('frontmatter and pattern behavior', () => {
        test('hasInfluxFrontmatterKey only accepts true or "true"', () => {
            expect(hasInfluxFrontmatterKey({ frontmatter: { influx: true } } as CachedMetadata)).toBe(true);
            expect(hasInfluxFrontmatterKey({ frontmatter: { influx: 'true' } } as CachedMetadata)).toBe(true);
            expect(hasInfluxFrontmatterKey({ frontmatter: { influx: false } } as CachedMetadata)).toBe(false);
            expect(hasInfluxFrontmatterKey({ frontmatter: { influx: 'false' } } as CachedMetadata)).toBe(false);
            expect(hasInfluxFrontmatterKey({ frontmatter: { other: true } } as CachedMetadata)).toBe(false);
            expect(hasInfluxFrontmatterKey(null)).toBe(false);
        });

        test('patternMatches supports trimmed regex patterns and ignores invalid values', () => {
            expect(patternMatches('/Notes/Test.md', ['  /Notes/  ', ''])).toBe(true);
            expect(patternMatches('/Notes/Test.md', ['[(broken', null as any, 12 as any])).toBe(false);
        });

        test('shouldShowInflux follows OPT_IN and OPT_OUT semantics', () => {
            const optIn = createSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Notes/'],
            });
            const optOut = createSettings({
                showBehaviour: 'OPT_OUT',
                exclusionPattern: ['/Archive/'],
            });

            expect(shouldShowInflux('/Notes/Test.md', optIn)).toBe(true);
            expect(shouldShowInflux('/Journal/Test.md', optIn)).toBe(false);
            expect(shouldShowInflux('/Archive/Test.md', optOut)).toBe(false);
            expect(shouldShowInflux('/Notes/Test.md', optOut)).toBe(true);
        });

        test('isIncludableSource follows source OPT_IN and OPT_OUT semantics', () => {
            const optIn = createSettings({
                sourceBehaviour: 'OPT_IN',
                sourceInclusionPattern: ['/Projects/'],
            });
            const optOut = createSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceExclusionPattern: ['/Daily/'],
            });

            expect(isIncludableSource('/Projects/A.md', optIn)).toBe(true);
            expect(isIncludableSource('/Notes/A.md', optIn)).toBe(false);
            expect(isIncludableSource('/Daily/2026-02-22.md', optOut)).toBe(false);
            expect(isIncludableSource('/Projects/A.md', optOut)).toBe(true);
        });

        test('shouldCollapseInflux is driven only by collapsedPattern matches', () => {
            const settings = createSettings({ collapsedPattern: ['/Daily/'] });
            expect(shouldCollapseInflux('/Daily/2026-02-22.md', settings)).toBe(true);
            expect(shouldCollapseInflux('/Projects/A.md', settings)).toBe(false);
        });
    });

    describe('dependency injection wrappers', () => {
        test('shouldShowInfluxWithMatcher uses injected matcher when frontmatter requirement is not enabled', () => {
            const matcher = jest.fn().mockReturnValue(true);
            const settings = createSettings({
                showBehaviour: 'OPT_IN',
                inclusionPattern: ['/Expected/'],
            });

            const result = shouldShowInfluxWithMatcher('/Any/Path.md', settings, matcher);

            expect(result).toBe(true);
            expect(matcher).toHaveBeenCalledWith('/Any/Path.md', ['/Expected/']);
        });

        test('shouldShowInfluxWithMatcher bypasses matcher when requireInfluxFrontmatterKey is true', () => {
            const matcher = jest.fn().mockReturnValue(true);
            const settings = createSettings({ requireInfluxFrontmatterKey: true });

            expect(
                shouldShowInfluxWithMatcher('/Any/Path.md', settings, matcher, { frontmatter: { influx: true } } as CachedMetadata)
            ).toBe(true);
            expect(
                shouldShowInfluxWithMatcher('/Any/Path.md', settings, matcher, { frontmatter: { influx: false } } as CachedMetadata)
            ).toBe(false);
            expect(matcher).not.toHaveBeenCalled();
        });

        test('isIncludableSourceWithMatcher and shouldCollapseInfluxWithMatcher pass expected patterns', () => {
            const sourceMatcher = jest.fn().mockReturnValue(false);
            const collapseMatcher = jest.fn().mockReturnValue(true);
            const settings = createSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceExclusionPattern: ['/Skip/'],
                collapsedPattern: ['/Collapse/'],
            });

            const includeResult = isIncludableSourceWithMatcher('/Skip/A.md', settings, sourceMatcher);
            const collapseResult = shouldCollapseInfluxWithMatcher('/Any/A.md', settings, collapseMatcher);

            expect(includeResult).toBe(true);
            expect(collapseResult).toBe(true);
            expect(sourceMatcher).toHaveBeenCalledWith('/Skip/A.md', ['/Skip/']);
            expect(collapseMatcher).toHaveBeenCalledWith('/Any/A.md', ['/Collapse/']);
        });
    });

    describe('comparators', () => {
        test('createFileComparator sorts date fields correctly', () => {
            const older = createMockFile('A', 10, 10);
            const newer = createMockFile('B', 20, 20);

            const byCtimeNewestFirst = createFileComparator('ctime', 'NEWEST_FIRST');
            const byMtimeOldestFirst = createFileComparator('mtime', 'OLDEST_FIRST');

            expect(byCtimeNewestFirst(older, newer)).toBe(1);
            expect(byCtimeNewestFirst(newer, older)).toBe(-1);
            expect(byMtimeOldestFirst(older, newer)).toBe(-1);
            expect(byMtimeOldestFirst(newer, older)).toBe(1);
        });

        test('createFileComparator sorts filenames according to sorting principle', () => {
            const a = createMockFile('A', 0, 0);
            const b = createMockFile('B', 0, 0);

            const oldestFirst = createFileComparator('FILENAME', 'OLDEST_FIRST');
            const newestFirst = createFileComparator('FILENAME', 'NEWEST_FIRST');

            expect(oldestFirst(a, b)).toBe(-1);
            expect(newestFirst(a, b)).toBe(1);
        });

        test('createInlinkingFileComparator applies configured sort behavior', () => {
            const a = createMockFile('A', 0, 100);
            const b = createMockFile('B', 0, 200);
            expect(
                createInlinkingFileComparator({
                    sortingAttribute: 'mtime',
                    sortingPrinciple: 'OLDEST_FIRST',
                })(a, b)
            ).toBe(-1);
        });
    });
});

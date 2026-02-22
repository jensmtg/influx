import { CachedMetadata, FrontmatterLinkCache, LinkCache } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from '../src/types';
import {
    validateFrontmatterProperties,
    convertFrontmatterLinkToLinkCache,
    filterFrontmatterLinks,
    mergeConvertedLinksIntoBacklinks,
    processFrontmatterLinks,
    filterFrontmatterLinksFromBacklinks,
} from '../src/frontmatter-utils';

jest.mock('../src/utils/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

const createSettings = (
    overrides: Partial<ObsidianInfluxSettings> = {}
): ObsidianInfluxSettings => ({ ...DEFAULT_SETTINGS, ...overrides });

const fmLink = (key: string, link: string): FrontmatterLinkCache => ({
    key,
    link,
    displayText: link,
    original: `[[${link}]]`,
} as FrontmatterLinkCache);

const linkAtLine = (link: string, line: number): LinkCache => ({
    link,
    position: {
        start: { line, col: 0, offset: 0 },
        end: { line, col: 10, offset: 10 },
    },
} as LinkCache);

describe('frontmatter-utils', () => {
    describe('property gates', () => {
        test('validateFrontmatterProperties keeps only non-empty strings', () => {
            expect(
                validateFrontmatterProperties(['related', '', '  ', 'see_also', null as any, undefined as any])
            ).toEqual(['related', 'see_also']);
            expect(validateFrontmatterProperties(null as any)).toEqual([]);
        });
    });

    describe('link conversion and property filtering', () => {
        test('convertFrontmatterLinkToLinkCache converts valid links and sets sentinel position', () => {
            const converted = convertFrontmatterLinkToLinkCache(fmLink('related', 'Test Note'));
            expect(converted).toMatchObject({
                link: 'Test Note',
                displayText: 'Test Note',
                original: '[[Test Note]]',
            });
            expect(converted?.position.start.line).toBe(-1);
        });

        test('convertFrontmatterLinkToLinkCache uses fallback display/original values', () => {
            const converted = convertFrontmatterLinkToLinkCache({ key: 'related', link: 'Fallback' } as FrontmatterLinkCache);
            expect(converted).toMatchObject({
                displayText: 'Fallback',
                original: '[[Fallback]]',
            });
        });

        test.each([
            null,
            undefined,
            'not-an-object',
            {},
            { link: '' },
            { link: null },
        ])('convertFrontmatterLinkToLinkCache returns null for invalid input: %p', (invalid) => {
            expect(convertFrontmatterLinkToLinkCache(invalid as any)).toBeNull();
        });

        test('filterFrontmatterLinks filters by key when target properties are provided', () => {
            const links = [fmLink('related', 'A'), fmLink('author', 'B'), fmLink('see_also', 'C')];
            expect(filterFrontmatterLinks(links, ['related', 'see_also']).map(l => l.link)).toEqual(['A', 'C']);
            expect(filterFrontmatterLinks(links, []).map(l => l.link)).toEqual(['A', 'B', 'C']);
        });
    });

    describe('backlinks merge pipeline', () => {
        test('mergeConvertedLinksIntoBacklinks merges for Map and appends repeated destinations', () => {
            const backlinks = { data: new Map<string, LinkCache[]>() };
            mergeConvertedLinksIntoBacklinks(backlinks, [{ link: 'A' } as LinkCache, { link: 'A' } as LinkCache]);
            expect(backlinks.data.get('A')).toHaveLength(2);
        });

        test('mergeConvertedLinksIntoBacklinks merges for Record and tolerates invalid input', () => {
            const backlinks = { data: { Existing: [{ link: 'Existing' } as LinkCache] } as Record<string, LinkCache[]> };
            mergeConvertedLinksIntoBacklinks(backlinks, [{ link: 'New' } as LinkCache]);
            expect(backlinks.data.Existing).toHaveLength(1);
            expect(backlinks.data.New).toHaveLength(1);
            expect(() => mergeConvertedLinksIntoBacklinks(null as any, [{ link: 'x' } as LinkCache])).not.toThrow();
            expect(() => mergeConvertedLinksIntoBacklinks(backlinks, null as any)).not.toThrow();
        });

        test('processFrontmatterLinks runs the full pipeline when enabled and property-filtered', () => {
            const backlinks = { data: new Map<string, LinkCache[]>() };
            const result = processFrontmatterLinks(
                backlinks,
                [fmLink('related', 'Included'), fmLink('author', 'Excluded')],
                createSettings({
                    includeFrontmatterLinks: true,
                    frontmatterProperties: ['related'],
                })
            );

            expect((result.data as Map<string, LinkCache[]>).get('Included')).toHaveLength(1);
            expect((result.data as Map<string, LinkCache[]>).get('Excluded')).toBeUndefined();
        });

        test('processFrontmatterLinks returns input unchanged when disabled or malformed', () => {
            const backlinks = { data: new Map<string, LinkCache[]>() };
            expect(
                processFrontmatterLinks(backlinks, [fmLink('related', 'A')], createSettings({ includeFrontmatterLinks: false }))
            ).toBe(backlinks);
            expect(processFrontmatterLinks(backlinks, null as any, createSettings({ includeFrontmatterLinks: true }))).toBe(backlinks);
        });
    });

    describe('frontmatter filtering from backlinks', () => {
        const getMetadata = jest.fn((_: string): CachedMetadata | null => null);

        beforeEach(() => {
            getMetadata.mockReset();
        });

        test('removes only frontmatter-matching links at frontmatter positions (Map data)', () => {
            const backlinks = {
                data: new Map<string, LinkCache[]>([
                    ['Source.md', [linkAtLine('Target', 0), linkAtLine('Target', 5)]],
                ]),
            };
            getMetadata.mockReturnValue({ frontmatterLinks: [fmLink('related', 'Target')] } as CachedMetadata);

            const result = filterFrontmatterLinksFromBacklinks(backlinks, 'Target', getMetadata);
            expect((result.data as Map<string, LinkCache[]>).get('Source.md')).toHaveLength(1);
            expect((result.data as Map<string, LinkCache[]>).get('Source.md')?.[0].position.start.line).toBe(5);
        });

        test('deletes a source key when all links are frontmatter-derived (Record data)', () => {
            const backlinks = {
                data: {
                    'Source.md': [{ link: 'Target' } as LinkCache],
                } as Record<string, LinkCache[]>,
            };
            getMetadata.mockReturnValue({ frontmatterLinks: [fmLink('related', 'Target')] } as CachedMetadata);

            const result = filterFrontmatterLinksFromBacklinks(backlinks, 'Target', getMetadata);
            expect((result.data as Record<string, LinkCache[]>)['Source.md']).toBeUndefined();
        });

        test('keeps links when metadata is missing or target is not in frontmatter links', () => {
            const mapBacklinks = {
                data: new Map<string, LinkCache[]>([
                    ['Source.md', [linkAtLine('Target', 0)]],
                ]),
            };
            getMetadata.mockReturnValue({ frontmatterLinks: [fmLink('related', 'Different')] } as CachedMetadata);
            const unmatched = filterFrontmatterLinksFromBacklinks(mapBacklinks, 'Target', getMetadata);
            expect((unmatched.data as Map<string, LinkCache[]>).get('Source.md')).toHaveLength(1);

            getMetadata.mockReturnValue(null);
            const missingMeta = filterFrontmatterLinksFromBacklinks(mapBacklinks, 'Target', getMetadata);
            expect((missingMeta.data as Map<string, LinkCache[]>).get('Source.md')).toHaveLength(1);
        });

        test('handles nullish backlinks container safely', () => {
            expect(() => filterFrontmatterLinksFromBacklinks(null as any, 'Target', getMetadata)).not.toThrow();
            expect(() => filterFrontmatterLinksFromBacklinks({} as any, 'Target', getMetadata)).not.toThrow();
        });
    });
});

import { CachedMetadata, FrontmatterLinkCache, LinkCache } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from '@/types';
import {
    validateFrontmatterProperties,
    convertFrontmatterLinkToLinkCache,
    filterBacklinksByFrontmatterProperties,
    filterFrontmatterLinks,
    mergeConvertedLinksIntoBacklinks,
    processFrontmatterLinks,
    filterFrontmatterLinksFromBacklinks,
} from '@/domain/backlinks/frontmatter-links';

jest.mock('@/platform/diagnostics/logger', () => ({
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

const linkWithoutPosition = (link: string): LinkCache => ({
	link,
	original: `[[${link}]]`,
} as LinkCache);

describe('frontmatter-utils', () => {
	describe('property gates', () => {
		test('validateFrontmatterProperties keeps only non-empty strings', () => {
			expect(validateFrontmatterProperties(['related', '', '  ', 'see_also'])).toEqual(['related', 'see_also']);
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

		test('convertFrontmatterLinkToLinkCache returns null for empty links', () => {
			expect(convertFrontmatterLinkToLinkCache({ key: 'related', link: '' } as FrontmatterLinkCache)).toBeNull();
		});

        test('filterFrontmatterLinks filters by key when target properties are provided', () => {
            const links = [fmLink('related', 'A'), fmLink('author', 'B'), fmLink('see_also', 'C')];
            expect(filterFrontmatterLinks(links, ['related', 'see_also']).map((l: FrontmatterLinkCache) => l.link)).toEqual(['A', 'C']);
            expect(filterFrontmatterLinks(links, []).map((l: FrontmatterLinkCache) => l.link)).toEqual(['A', 'B', 'C']);
        });
    });

    describe('backlinks merge pipeline', () => {
        test('mergeConvertedLinksIntoBacklinks merges for Map and appends repeated destinations', () => {
            const backlinks = { data: new Map<string, LinkCache[]>() };
            mergeConvertedLinksIntoBacklinks(backlinks, [{ link: 'A' } as LinkCache, { link: 'A' } as LinkCache]);
            expect(backlinks.data.get('A')).toHaveLength(2);
        });

		test('mergeConvertedLinksIntoBacklinks merges for Record data', () => {
			const backlinks = { data: { Existing: [{ link: 'Existing' } as LinkCache] } as Record<string, LinkCache[]> };
			mergeConvertedLinksIntoBacklinks(backlinks, [{ link: 'New' } as LinkCache]);
			expect(backlinks.data.Existing).toHaveLength(1);
			expect(backlinks.data.New).toHaveLength(1);
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

		test('processFrontmatterLinks returns input unchanged when disabled or when there are no frontmatter links to merge', () => {
			const backlinks = { data: new Map<string, LinkCache[]>() };
			expect(
				processFrontmatterLinks(backlinks, [fmLink('related', 'A')], createSettings({ includeFrontmatterLinks: false }))
			).toBe(backlinks);
			expect(processFrontmatterLinks(backlinks, [], createSettings({ includeFrontmatterLinks: true }))).toBe(backlinks);
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

        test('uses frontmatterPosition range when available', () => {
            const backlinks = {
                data: new Map<string, LinkCache[]>([
                    ['Source.md', [linkAtLine('Target', 6), linkAtLine('Target', 12)]],
                ]),
            };
            getMetadata.mockReturnValue({
                frontmatterLinks: [fmLink('related', 'Target')],
                frontmatterPosition: {
                    start: { line: 0, col: 0, offset: 0 },
                    end: { line: 8, col: 0, offset: 0 },
                },
            } as CachedMetadata);

            const result = filterFrontmatterLinksFromBacklinks(backlinks, 'Target', getMetadata);
            expect((result.data as Map<string, LinkCache[]>).get('Source.md')).toHaveLength(1);
            expect((result.data as Map<string, LinkCache[]>).get('Source.md')?.[0].position.start.line).toBe(12);
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

		test('removes missing-position backlinks when metadata says the target came from frontmatter', () => {
			const backlinks = {
				data: new Map<string, LinkCache[]>([
					['Source.md', [linkWithoutPosition('Folder/Target.md#Section')]],
				]),
			};
			getMetadata.mockReturnValue({
				frontmatterLinks: [
					{
						key: 'related',
						link: 'Folder/Target.md#Section',
						displayText: 'Alias',
						original: '[[Folder/Target.md#Section|Alias]]',
					} as FrontmatterLinkCache,
				],
			} as CachedMetadata);

			const result = filterFrontmatterLinksFromBacklinks(backlinks, 'Target', getMetadata);
			expect((result.data as Map<string, LinkCache[]>).has('Source.md')).toBe(false);
		});

		test('removes frontmatter links but preserves body links from the same source when path and alias forms mix', () => {
			const backlinks = {
				data: new Map<string, LinkCache[]>([
					['Source.md', [linkAtLine('Folder/Target.md#Section', 1), linkAtLine('Target', 14)]],
				]),
			};
			getMetadata.mockReturnValue({
				frontmatterLinks: [
					{
						key: 'related',
						link: 'Folder/Target.md#Section',
						displayText: 'Alias',
						original: '[[Folder/Target.md#Section|Alias]]',
					} as FrontmatterLinkCache,
				],
				frontmatterPosition: {
					start: { line: 0, col: 0, offset: 0 },
					end: { line: 6, col: 0, offset: 0 },
				},
			} as CachedMetadata);

			const result = filterFrontmatterLinksFromBacklinks(backlinks, 'Target', getMetadata);
			expect((result.data as Map<string, LinkCache[]>).get('Source.md')).toEqual([linkAtLine('Target', 14)]);
		});

		test('keeps only frontmatter backlinks from allowed properties while preserving body links', () => {
			const backlinks = {
				data: new Map<string, LinkCache[]>([
					['RelatedSource.md', [linkAtLine('Target', 0)]],
					['AuthorSource.md', [linkAtLine('Target', 0)]],
					['BodySource.md', [linkAtLine('Target', 12)]],
				]),
			};

			getMetadata.mockImplementation((path: string) => {
				if (path === 'RelatedSource.md') {
					return { frontmatterLinks: [fmLink('related', 'Target')] } as CachedMetadata;
				}
				if (path === 'AuthorSource.md') {
					return { frontmatterLinks: [fmLink('author', 'Target')] } as CachedMetadata;
				}
				if (path === 'BodySource.md') {
					return { frontmatterLinks: [fmLink('related', 'Target')] } as CachedMetadata;
				}
				return null;
			});

			const result = filterBacklinksByFrontmatterProperties(backlinks, 'Target', ['related'], getMetadata);

			expect((result.data as Map<string, LinkCache[]>).has('RelatedSource.md')).toBe(true);
			expect((result.data as Map<string, LinkCache[]>).has('AuthorSource.md')).toBe(false);
			expect((result.data as Map<string, LinkCache[]>).has('BodySource.md')).toBe(true);
		});

		test('treats alias and path-style frontmatter links as matches for allowed properties', () => {
			const backlinks = {
				data: new Map<string, LinkCache[]>([
					['AliasSource.md', [linkAtLine('Folder/Target.md#Section', 0)]],
				]),
			};

			getMetadata.mockReturnValue({
				frontmatterLinks: [
					{
						key: 'related',
						link: 'Folder/Target.md#Section',
						displayText: 'Alias',
						original: '[[Folder/Target.md#Section|Alias]]',
					} as FrontmatterLinkCache,
				],
			} as CachedMetadata);

			const result = filterBacklinksByFrontmatterProperties(backlinks, 'Target', ['related'], getMetadata);
			expect((result.data as Map<string, LinkCache[]>).get('AliasSource.md')).toHaveLength(1);
		});

		test('conservatively keeps duplicate target backlinks when the same target appears in both allowed and disallowed frontmatter properties', () => {
			const backlinks = {
				data: new Map<string, LinkCache[]>([
					['Source.md', [linkAtLine('Target', 0), linkAtLine('Target', 1)]],
				]),
			};

			getMetadata.mockReturnValue({
				frontmatterLinks: [fmLink('related', 'Target'), fmLink('author', 'Target')],
			} as CachedMetadata);

			const result = filterBacklinksByFrontmatterProperties(backlinks, 'Target', ['related'], getMetadata);
			expect((result.data as Map<string, LinkCache[]>).get('Source.md')).toHaveLength(2);
		});
    });
});

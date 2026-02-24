import { LinkCache } from 'obsidian';
import { extractLinkName, compareLinkName, filterLinksByBasename } from '@/domain/backlinks/link-matching';

const link = (value: string): LinkCache => ({
    link: value,
    displayText: value,
    original: `[[${value}]]`,
    position: {
        start: { line: 0, col: 0, offset: 0 },
        end: { line: 0, col: value.length, offset: value.length },
    },
});

describe('link-utils', () => {
    describe('extractLinkName', () => {
        test.each([
            ['Test Note', 'test note'],
            ['folder/subfolder/Test Note.md#heading^block', 'test note'],
            ['TEST NOTE', 'test note'],
            ['folder\\sub\\Windows Note.MD', 'windows note'],
            ['a/b/readme.md.backup', 'readme.md.backup'],
        ])('extractLinkName(%p) -> %p', (input, expected) => {
            expect(extractLinkName(link(input))).toBe(expected);
        });
    });

    describe('compareLinkName', () => {
        test('matches equivalent link/basename forms case-insensitively', () => {
            expect(compareLinkName(link('folder/Test Note.md#heading'), 'test note')).toBe(true);
        });

        test('returns false for different names', () => {
            expect(compareLinkName(link('Test Note'), 'Different Note')).toBe(false);
        });
    });

    describe('filterLinksByBasename', () => {
        test('returns only links matching basename across path/ref/case variants', () => {
            const links = [
                link('Test Note'),
                link('folder/Test Note.md#heading'),
                link('test note'),
                link('Different Note'),
            ];

            const result = filterLinksByBasename(links, 'TEST NOTE');
            expect(result.map((item) => item.link)).toEqual([
                'Test Note',
                'folder/Test Note.md#heading',
                'test note',
            ]);
        });

        test('returns empty array when there are no matches', () => {
            expect(filterLinksByBasename([], 'Anything')).toEqual([]);
            expect(filterLinksByBasename([link('Note A'), link('Note B')], 'Missing')).toEqual([]);
        });
    });
});

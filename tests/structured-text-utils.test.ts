import {
    lastNonEmptyElement,
    ifOrderedListItemReturnOrdinal,
    parseMarkdownTableRow,
    isProperBullet,
    calculateLeadingIndent,
    generateNodeId,
    padToNodeId,
    stripBulletMarker,
    stripOrdinalMarker,
} from '../src/utils/structured-text-utils';

describe('structured-text-utils', () => {
    describe('lastNonEmptyElement', () => {
        test('returns the last non-empty value and respects offset trimming', () => {
            expect(lastNonEmptyElement(['0000', undefined as any, '0002', '', '0004'])).toBe('0004');
            expect(lastNonEmptyElement(['0000', '0001', '0002'], 1)).toBe('0001');
        });

        test('returns null for empty/empty-like stacks', () => {
            expect(lastNonEmptyElement([])).toBeNull();
            expect(lastNonEmptyElement([undefined as any, '', null as any])).toBeNull();
        });
    });

    describe('ifOrderedListItemReturnOrdinal', () => {
        test.each([
            ['1. Alpha', 1],
            ['2222. Charlie', 2222],
            ['* Bullet', undefined],
            ['Plain text', undefined],
            ['', undefined],
        ])('parses %p -> %p', (input, expected) => {
            expect(ifOrderedListItemReturnOrdinal(input)).toBe(expected);
        });
    });

    describe('parseMarkdownTableRow', () => {
        test.each([
            ['| king | kong |', { cols: 2, isDivider: false }],
            ['| --- | --- |', { cols: 2, isDivider: true }],
            ['| a | LINK |', { cols: 2, isDivider: false }],
            ['| king | kong | 2 |', { cols: 3, isDivider: false }],
        ])('parses valid table row %p', (row, expected) => {
            expect(parseMarkdownTableRow(row)).toEqual(expected);
        });

        test.each([
            '* Bullet item',
            '',
        ])('returns null for non-table row %p', (row) => {
            expect(parseMarkdownTableRow(row)).toBeNull();
        });
    });

    describe('isProperBullet', () => {
        test.each([
            ['* Alpha', true],
            ['- Alpha', true],
            ['1. Alpha', false],
            ['> Quote text', false],
            ['Just text', false],
            ['*', false],
        ])('isProperBullet(%p) => %p', (input, expected) => {
            expect(isProperBullet(input)).toBe(expected);
        });
    });

    describe('calculateLeadingIndent', () => {
        test.each([
            ['* Alpha', 0],
            ['    * Alpha', 4],
            ['', 0],
            ['    ', 4],
        ])('calculateLeadingIndent(%p) => %p', (line, expected) => {
            expect(calculateLeadingIndent(line)).toBe(expected);
        });
    });

    describe('node id helpers', () => {
        test.each([
            [0, '0000'],
            [5, '0005'],
            [42, '0042'],
            [123, '0123'],
            [1234, '1234'],
        ])('generateNodeId(%p) => %p', (input, expected) => {
            expect(generateNodeId(input)).toBe(expected);
        });

        test('padToNodeId mirrors node-id padding behavior', () => {
            expect(padToNodeId(5)).toBe('0005');
            expect(padToNodeId(1234)).toBe('1234');
        });
    });

    describe('marker stripping', () => {
        test.each([
            ['* Alpha ', 'Alpha '],
            ['- Bravo ', 'Bravo '],
            ['* [x] Checkbox item', '[x] Checkbox item'],
        ])('stripBulletMarker(%p) => %p', (input, expected) => {
            expect(stripBulletMarker(input)).toBe(expected);
        });

        test.each([
            ['1. Alpha ', 1, 'Alpha '],
            ['2222. Charlie ', 2222, 'Charlie '],
        ])('stripOrdinalMarker(%p, %p) => %p', (input, ordinal, expected) => {
            expect(stripOrdinalMarker(input, ordinal)).toBe(expected);
        });
    });
});

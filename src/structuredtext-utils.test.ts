// Unit tests for StructuredText utility functions
// Tests the actual pure functions extracted from StructuredText

import {
    lastNonEmptyElement,
    ifOrderedListItemReturnOrdinal,
    parseMarkdownTableRow,
    isProperBullet,
    calculateLeadingIndent,
    generateNodeId,
    padToNodeId,
    stripBulletMarker,
    stripOrdinalMarker
} from './structuredtext-utils';

describe('StructuredText Utils', () => {

    describe('lastNonEmptyElement', () => {
        test('should return last element with no offset', () => {
            // Arrange
            const stack = ['0000', '0001', '0002'];

            // Act
            const result = lastNonEmptyElement(stack);

            // Assert
            expect(result).toBe('0002');
        });

        test('should return second-to-last element with offset of 1', () => {
            // Arrange
            const stack = ['0000', '0001', '0002'];

            // Act
            const result = lastNonEmptyElement(stack, 1);

            // Assert
            expect(result).toBe('0001');
        });

        test('should skip empty strings in stack', () => {
            // Arrange
            const stack = ['0000', undefined as any, '0002', '', '0004'];

            // Act
            const result = lastNonEmptyElement(stack);

            // Assert
            expect(result).toBe('0004');
        });

        test('should return null for empty stack', () => {
            // Arrange
            const stack: string[] = [];

            // Act
            const result = lastNonEmptyElement(stack);

            // Assert
            expect(result).toBeNull();
        });

        test('should return null for stack with only empty values', () => {
            // Arrange
            const stack = [undefined as any, '', null as any];

            // Act
            const result = lastNonEmptyElement(stack);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe('ifOrderedListItemReturnOrdinal', () => {
        test('should return ordinal for valid ordered list', () => {
            // Arrange
            const input = '1. Alpha';

            // Act
            const result = ifOrderedListItemReturnOrdinal(input);

            // Assert
            expect(result).toBe(1);
        });

        test('should handle multi-digit ordinals', () => {
            // Arrange
            const input = '2222. Charlie';

            // Act
            const result = ifOrderedListItemReturnOrdinal(input);

            // Assert
            expect(result).toBe(2222);
        });

        test('should return undefined for non-ordered list', () => {
            // Arrange
            const input = '* Bullet item';

            // Act
            const result = ifOrderedListItemReturnOrdinal(input);

            // Assert
            expect(result).toBeUndefined();
        });

        test('should return undefined for plain text', () => {
            // Arrange
            const input = 'Just plain text';

            // Act
            const result = ifOrderedListItemReturnOrdinal(input);

            // Assert
            expect(result).toBeUndefined();
        });

        test('should return undefined for empty string', () => {
            // Arrange
            const input = '';

            // Act
            const result = ifOrderedListItemReturnOrdinal(input);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe('parseMarkdownTableRow', () => {
        test('should parse simple table row', () => {
            // Arrange
            const row = '| king | kong |';

            // Act
            const result = parseMarkdownTableRow(row);

            // Assert
            expect(result).not.toBeNull();
            expect(result!.cols).toBe(2);
            expect(result!.isDivider).toBe(false);
        });

        test('should identify divider row', () => {
            // Arrange
            const row = '| --- | --- |';

            // Act
            const result = parseMarkdownTableRow(row);

            // Assert
            expect(result).not.toBeNull();
            expect(result!.cols).toBe(2);
            expect(result!.isDivider).toBe(true);
        });

        test('should handle mixed divider/content row', () => {
            // Arrange
            const row = '| a | LINK |';

            // Act
            const result = parseMarkdownTableRow(row);

            // Assert
            expect(result).not.toBeNull();
            expect(result!.cols).toBe(2);
            expect(result!.isDivider).toBe(false); // One cell is not '---'
        });

        test('should handle three-column table', () => {
            // Arrange
            const row = '| king | kong | 2 |';

            // Act
            const result = parseMarkdownTableRow(row);

            // Assert
            expect(result).not.toBeNull();
            expect(result!.cols).toBe(3);
        });

        test('should return null for non-table row', () => {
            // Arrange
            const row = '* Bullet item';

            // Act
            const result = parseMarkdownTableRow(row);

            // Assert
            expect(result).toBeNull();
        });

        test('should return null for empty string', () => {
            // Arrange
            const row = '';

            // Act
            const result = parseMarkdownTableRow(row);

            // Assert
            expect(result).toBeNull();
        });
    });

    describe('isProperBullet', () => {
        test('should identify asterisk bullet', () => {
            // Arrange
            const trimmed = '* Alpha';

            // Act
            const result = isProperBullet(trimmed);

            // Assert
            expect(result).toBe(true);
        });

        test('should identify dash bullet', () => {
            // Arrange
            const trimmed = '- Alpha';

            // Act
            const result = isProperBullet(trimmed);

            // Assert
            expect(result).toBe(true);
        });

        test('should reject ordered list', () => {
            // Arrange
            const trimmed = '1. Alpha';

            // Act
            const result = isProperBullet(trimmed);

            // Assert
            expect(result).toBe(false);
        });

        test('should reject quote', () => {
            // Arrange
            const trimmed = '> Quote text';

            // Act
            const result = isProperBullet(trimmed);

            // Assert
            expect(result).toBe(false);
        });

        test('should reject plain text', () => {
            // Arrange
            const trimmed = 'Just text';

            // Act
            const result = isProperBullet(trimmed);

            // Assert
            expect(result).toBe(false);
        });

        test('should reject single asterisk', () => {
            // Arrange
            const trimmed = '*';

            // Act
            const result = isProperBullet(trimmed);

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('calculateLeadingIndent', () => {
        test('should return zero for non-indented line', () => {
            // Arrange
            const line = '* Alpha';

            // Act
            const result = calculateLeadingIndent(line);

            // Assert
            expect(result).toBe(0);
        });

        test('should count spaces correctly', () => {
            // Arrange
            const line = '    * Alpha'; // 4 spaces

            // Act
            const result = calculateLeadingIndent(line);

            // Assert
            expect(result).toBe(4);
        });

        test('should return zero for empty string', () => {
            // Arrange
            const line = '';

            // Act
            const result = calculateLeadingIndent(line);

            // Assert
            expect(result).toBe(0);
        });

        test('should return line length for whitespace-only line', () => {
            // Arrange
            const line = '    '; // 4 spaces

            // Act
            const result = calculateLeadingIndent(line);

            // Assert
            expect(result).toBe(4);
        });
    });

    describe('generateNodeId', () => {
        test('should pad single digit to 4 characters', () => {
            // Arrange
            const index = 0;

            // Act
            const result = generateNodeId(index);

            // Assert
            expect(result).toBe('0000');
        });

        test('should pad double digit to 4 characters', () => {
            // Arrange
            const index = 42;

            // Act
            const result = generateNodeId(index);

            // Assert
            expect(result).toBe('0042');
        });

        test('should handle triple digit', () => {
            // Arrange
            const index = 123;

            // Act
            const result = generateNodeId(index);

            // Assert
            expect(result).toBe('0123');
        });

        test('should handle four digit', () => {
            // Arrange
            const index = 1234;

            // Act
            const result = generateNodeId(index);

            // Assert
            expect(result).toBe('1234');
        });
    });

    describe('padToNodeId', () => {
        test('should pad index to 4 characters', () => {
            // Arrange
            const index = 5;

            // Act
            const result = padToNodeId(index);

            // Assert
            expect(result).toBe('0005');
        });
    });

    describe('stripBulletMarker', () => {
        test('should strip asterisk bullet', () => {
            // Arrange
            const trimmed = '* Alpha ';

            // Act
            const result = stripBulletMarker(trimmed);

            // Assert
            expect(result).toBe('Alpha ');
        });

        test('should strip dash bullet', () => {
            // Arrange
            const trimmed = '- Bravo ';

            // Act
            const result = stripBulletMarker(trimmed);

            // Assert
            expect(result).toBe('Bravo ');
        });

        test('should preserve content after marker', () => {
            // Arrange
            const trimmed = '* [x] Checkbox item';

            // Act
            const result = stripBulletMarker(trimmed);

            // Assert
            expect(result).toBe('[x] Checkbox item');
        });
    });

    describe('stripOrdinalMarker', () => {
        test('should strip single-digit ordinal', () => {
            // Arrange
            const trimmed = '1. Alpha ';
            const ordinal = 1;

            // Act
            const result = stripOrdinalMarker(trimmed, ordinal);

            // Assert
            expect(result).toBe('Alpha ');
        });

        test('should strip multi-digit ordinal', () => {
            // Arrange
            const trimmed = '2222. Charlie ';
            const ordinal = 2222;

            // Act
            const result = stripOrdinalMarker(trimmed, ordinal);

            // Assert
            expect(result).toBe('Charlie ');
        });
    });
});

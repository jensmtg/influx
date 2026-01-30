// Unit tests for settings utility functions
// Tests the actual pure functions extracted from settings.tsx

import {
    validateYamlPropertyNames,
    isValidYamlPropertyName
} from './settings-utils';

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
});

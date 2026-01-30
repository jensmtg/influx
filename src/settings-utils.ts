/**
 * Pure utility functions for settings validation and processing
 * Extracted from settings.tsx for testability
 */

export interface ValidationResult {
    valid: string[];
    invalid: string[];
}

/**
 * Validates YAML property names according to YAML specification.
 * Valid property names must:
 * - Start with a letter or underscore
 * - Contain only letters, numbers, underscores, and hyphens
 *
 * @param properties - Array of property name strings to validate
 * @returns Object containing valid and invalid property arrays
 */
export function validateYamlPropertyNames(properties: string[] | null | undefined): ValidationResult {
    if (!Array.isArray(properties)) {
        return { valid: [], invalid: [] };
    }

    // Filter to non-empty strings
    const nonEmpty = properties.filter(prop => prop && typeof prop === 'string' && prop.trim().length > 0);

    // YAML property name regex
    const yamlPropertyRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const prop of nonEmpty) {
        if (yamlPropertyRegex.test(prop)) {
            valid.push(prop);
        } else {
            invalid.push(prop);
        }
    }

    return { valid, invalid };
}

/**
 * Checks if a given property name is a valid YAML property name.
 *
 * @param property - Property name to validate
 * @returns true if valid, false otherwise
 */
export function isValidYamlPropertyName(property: string): boolean {
    if (!property || typeof property !== 'string') {
        return false;
    }
    const yamlPropertyRegex = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
    return yamlPropertyRegex.test(property);
}

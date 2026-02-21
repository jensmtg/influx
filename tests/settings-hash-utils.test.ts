/**
 * Unit tests for settings hash computation
 * Tests the pure function extracted from PreviewManager for testability
 */

import { computeSettingsHash } from '../src/settings-hash-utils';
import { ObsidianInfluxSettings, DEFAULT_SETTINGS } from '../src/types';

describe('computeSettingsHash', () => {
    const createSettings = (overrides: Partial<ObsidianInfluxSettings> = {}): ObsidianInfluxSettings => {
        return { ...DEFAULT_SETTINGS, ...overrides };
    };

    describe('frontmatterProperties in hash', () => {
        it('should produce different hashes when frontmatterProperties changes', () => {
            const settings1 = createSettings({ frontmatterProperties: ['related', 'see_also'] });
            const settings2 = createSettings({ frontmatterProperties: ['references'] });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
            expect(hash1.length).toBeGreaterThan(0);
            expect(hash2.length).toBeGreaterThan(0);
        });

        it('should produce same hash for equivalent frontmatterProperties regardless of order', () => {
            const settings1 = createSettings({ frontmatterProperties: ['related', 'see_also', 'references'] });
            const settings2 = createSettings({ frontmatterProperties: ['references', 'related', 'see_also'] });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).toBe(hash2);
        });

        it('should produce different hashes when frontmatterProperties changes from empty to populated', () => {
            const settings1 = createSettings({ frontmatterProperties: [] });
            const settings2 = createSettings({ frontmatterProperties: ['related'] });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('sourceBehaviour in hash', () => {
        it('should produce different hashes when sourceBehaviour changes with empty patterns', () => {
            const settings1 = createSettings({
                sourceBehaviour: 'OPT_IN',
                sourceInclusionPattern: [],
                sourceExclusionPattern: []
            });
            const settings2 = createSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceInclusionPattern: [],
                sourceExclusionPattern: []
            });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce same hash for identical settings regardless of pattern order', () => {
            const settings1 = createSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceExclusionPattern: ['pattern1', 'pattern2']
            });
            const settings2 = createSettings({
                sourceBehaviour: 'OPT_OUT',
                sourceExclusionPattern: ['pattern2', 'pattern1']
            });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).toBe(hash2);
        });
    });

    describe('fontSize in hash', () => {
        it('should produce different hashes when fontSize changes', () => {
            const settings1 = createSettings({ fontSize: 13 });
            const settings2 = createSettings({ fontSize: 16 });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce same hash for same fontSize', () => {
            const settings1 = createSettings({ fontSize: 15 });
            const settings2 = createSettings({ fontSize: 15 });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).toBe(hash2);
        });
    });

    describe('includeFrontmatterLinks in hash', () => {
        it('should produce different hashes when includeFrontmatterLinks toggles', () => {
            const settings1 = createSettings({ includeFrontmatterLinks: false });
            const settings2 = createSettings({ includeFrontmatterLinks: true });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('other settings in hash', () => {
        it('should produce different hashes when sortingPrinciple changes', () => {
            const settings1 = createSettings({ sortingPrinciple: 'NEWEST_FIRST' });
            const settings2 = createSettings({ sortingPrinciple: 'OLDEST_FIRST' });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes when sortingAttribute changes', () => {
            const settings1 = createSettings({ sortingAttribute: 'ctime' });
            const settings2 = createSettings({ sortingAttribute: 'mtime' });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes when showBehaviour changes', () => {
            const settings1 = createSettings({ showBehaviour: 'OPT_IN' });
            const settings2 = createSettings({ showBehaviour: 'OPT_OUT' });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes when variant changes', () => {
            const settings1 = createSettings({ variant: 'CENTER_ALIGNED' });
            const settings2 = createSettings({ variant: 'ROWS' });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes when entryHeaderVisible toggles', () => {
            const settings1 = createSettings({ entryHeaderVisible: true });
            const settings2 = createSettings({ entryHeaderVisible: false });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes when influxAtTopOfPage toggles', () => {
            const settings1 = createSettings({ influxAtTopOfPage: false });
            const settings2 = createSettings({ influxAtTopOfPage: true });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes when listLimit changes', () => {
            const settings1 = createSettings({ listLimit: 0 });
            const settings2 = createSettings({ listLimit: 10 });

            const hash1 = computeSettingsHash(settings1);
            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('hash stability', () => {
        it('should produce consistent hash for unchanged settings', () => {
            const settings = createSettings({
                frontmatterProperties: ['related', 'see_also'],
                sourceBehaviour: 'OPT_OUT',
                fontSize: 14,
            });

            const hash1 = computeSettingsHash(settings);
            const hash2 = computeSettingsHash(settings);
            const hash3 = computeSettingsHash(settings);

            expect(hash1).toBe(hash2);
            expect(hash2).toBe(hash3);
        });

        it('should produce hash string that is not empty', () => {
            const settings = createSettings();
            const hash = computeSettingsHash(settings);

            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });
    });

    describe('pattern arrays in hash', () => {
        it('should handle empty pattern arrays in hash', () => {
            const settings1 = createSettings({
                exclusionPattern: [],
                inclusionPattern: [],
                collapsedPattern: [],
                sourceInclusionPattern: [],
                sourceExclusionPattern: [],
            });

            const hash1 = computeSettingsHash(settings1);

            const settings2 = createSettings({
                exclusionPattern: ['pattern'],
                inclusionPattern: [],
                collapsedPattern: [],
                sourceInclusionPattern: [],
                sourceExclusionPattern: [],
            });

            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should handle pattern arrays with multiple entries', () => {
            const settings1 = createSettings({
                exclusionPattern: ['^templates/', 'daily'],
            });

            const hash1 = computeSettingsHash(settings1);

            const settings2 = createSettings({
                exclusionPattern: ['^templates/', 'daily', 'menu'],
            });

            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('combined settings changes', () => {
        it('should detect changes when multiple settings change simultaneously', () => {
            const settings1 = createSettings({
                frontmatterProperties: ['related'],
                sourceBehaviour: 'OPT_IN',
                fontSize: 13,
            });

            const hash1 = computeSettingsHash(settings1);

            const settings2 = createSettings({
                frontmatterProperties: ['related', 'see_also'],
                sourceBehaviour: 'OPT_OUT',
                fontSize: 15,
            });

            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });

        it('should produce different hashes when only one setting changes in a complex configuration', () => {
            const baseSettings = createSettings({
                frontmatterProperties: ['related', 'see_also'],
                sourceBehaviour: 'OPT_OUT',
                fontSize: 14,
                sortingPrinciple: 'NEWEST_FIRST',
                sortingAttribute: 'ctime',
                listLimit: 20,
                showBehaviour: 'OPT_OUT',
                variant: 'CENTER_ALIGNED',
                entryHeaderVisible: true,
                influxAtTopOfPage: false,
                includeFrontmatterLinks: true,
                exclusionPattern: ['^templates/'],
                inclusionPattern: [],
                collapsedPattern: [],
                sourceInclusionPattern: [],
                sourceExclusionPattern: ['daily'],
            });

            const hash1 = computeSettingsHash(baseSettings);

            const settings2 = createSettings({
                ...baseSettings,
                fontSize: 15, // Only change fontSize
            });

            const hash2 = computeSettingsHash(settings2);

            expect(hash1).not.toBe(hash2);
        });
    });
});

import { computeSettingsHash } from '@/domain/settings/settings-hash';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from '@/types';

const createSettings = (
    overrides: Partial<ObsidianInfluxSettings> = {}
): ObsidianInfluxSettings => ({ ...DEFAULT_SETTINGS, ...overrides });

describe('computeSettingsHash', () => {
    test('returns stable non-empty hash for identical settings', () => {
        const settings = createSettings({
            frontmatterProperties: ['related', 'see_also'],
            exclusionPattern: ['^templates/'],
        });

        const hashA = computeSettingsHash(settings);
        const hashB = computeSettingsHash(settings);

        expect(hashA).toBe(hashB);
        expect(hashA.length).toBeGreaterThan(0);
    });

    test('treats relevant arrays as order-insensitive', () => {
        const left = createSettings({
            frontmatterProperties: ['alpha', 'beta', 'gamma'],
            exclusionPattern: ['one', 'two'],
            inclusionPattern: ['include-a', 'include-b'],
            collapsedPattern: ['x', 'y'],
            sourceInclusionPattern: ['s1', 's2'],
            sourceExclusionPattern: ['e1', 'e2'],
        });
        const right = createSettings({
            frontmatterProperties: ['gamma', 'beta', 'alpha'],
            exclusionPattern: ['two', 'one'],
            inclusionPattern: ['include-b', 'include-a'],
            collapsedPattern: ['y', 'x'],
            sourceInclusionPattern: ['s2', 's1'],
            sourceExclusionPattern: ['e2', 'e1'],
        });

        expect(computeSettingsHash(left)).toBe(computeSettingsHash(right));
    });

    const sensitivityCases: Array<[string, Partial<ObsidianInfluxSettings>]> = [
        ['sortingPrinciple', { sortingPrinciple: 'OLDEST_FIRST' }],
        ['sortingAttribute', { sortingAttribute: 'mtime' }],
        ['listLimit', { listLimit: 42 }],
        ['showBehaviour', { showBehaviour: 'OPT_IN' }],
        ['sourceBehaviour', { sourceBehaviour: 'OPT_IN' }],
        ['variant', { variant: 'ROWS' }],
        ['entryHeaderVisible', { entryHeaderVisible: !DEFAULT_SETTINGS.entryHeaderVisible }],
        ['influxAtTopOfPage', { influxAtTopOfPage: !DEFAULT_SETTINGS.influxAtTopOfPage }],
        ['includeFrontmatterLinks', { includeFrontmatterLinks: !DEFAULT_SETTINGS.includeFrontmatterLinks }],
        ['frontmatterProperties', { frontmatterProperties: ['different'] }],
        ['fontSize', { fontSize: DEFAULT_SETTINGS.fontSize + 1 }],
        ['exclusionPattern', { exclusionPattern: ['exclude-me'] }],
        ['inclusionPattern', { inclusionPattern: ['include-me'] }],
        ['collapsedPattern', { collapsedPattern: ['collapse-me'] }],
        ['sourceInclusionPattern', { sourceInclusionPattern: ['src-include'] }],
        ['sourceExclusionPattern', { sourceExclusionPattern: ['src-exclude'] }],
        ['requireInfluxFrontmatterKey', { requireInfluxFrontmatterKey: !DEFAULT_SETTINGS.requireInfluxFrontmatterKey }],
        ['collapseAllByDefault', { collapseAllByDefault: !DEFAULT_SETTINGS.collapseAllByDefault }],
        ['showInfluxInSidebar', { showInfluxInSidebar: !DEFAULT_SETTINGS.showInfluxInSidebar }],
    ];

    test.each(sensitivityCases)(
        'changes hash when %s changes',
        (_name, overrides) => {
            const baseline = createSettings();
            const changed = createSettings(overrides);

            expect(computeSettingsHash(changed)).not.toBe(computeSettingsHash(baseline));
        }
    );
});

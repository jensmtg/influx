import {
	computeBuildSettingsHash,
	computeRenderSettingsHash,
	computeSettingsHash,
} from '@/domain/settings/settings-hash';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from '@/types';

const createSettings = (
    overrides: Partial<ObsidianInfluxSettings> = {}
): ObsidianInfluxSettings => ({ ...DEFAULT_SETTINGS, ...overrides });

describe('settings hash helpers', () => {
	test('computeSettingsHash aliases render hash', () => {
		const settings = createSettings();
		expect(computeSettingsHash(settings)).toBe(computeRenderSettingsHash(settings));
	});

	test('build hash is stable and order-insensitive for build arrays', () => {
		const left = createSettings({
			frontmatterProperties: ['alpha', 'beta', 'gamma'],
			exclusionPattern: ['one', 'two'],
			inclusionPattern: ['include-a', 'include-b'],
			sourceInclusionPattern: ['s1', 's2'],
			sourceExclusionPattern: ['e1', 'e2'],
		});
		const right = createSettings({
			frontmatterProperties: ['gamma', 'beta', 'alpha'],
			exclusionPattern: ['two', 'one'],
			inclusionPattern: ['include-b', 'include-a'],
			sourceInclusionPattern: ['s2', 's1'],
			sourceExclusionPattern: ['e2', 'e1'],
		});

		expect(computeBuildSettingsHash(left)).toBe(computeBuildSettingsHash(right));
	});

	test('render hash is stable and order-insensitive for render arrays', () => {
		const left = createSettings({ collapsedPattern: ['x', 'y'] });
		const right = createSettings({ collapsedPattern: ['y', 'x'] });

		expect(computeRenderSettingsHash(left)).toBe(computeRenderSettingsHash(right));
	});

		test('build hash changes for build-affecting settings', () => {
			const baseline = createSettings();
			const sensitivityCases: Array<Partial<ObsidianInfluxSettings>> = [
				{ sortingPrinciple: 'OLDEST_FIRST' },
				{ sortingAttribute: 'mtime' },
				{ listLimit: 42 },
				{ sourceBehaviour: 'OPT_IN' },
				{ includeFrontmatterLinks: !DEFAULT_SETTINGS.includeFrontmatterLinks },
				{ frontmatterProperties: ['different'] },
				{ sourceInclusionPattern: ['src-include'] },
				{ sourceExclusionPattern: ['src-exclude'] },
			];

		for (const overrides of sensitivityCases) {
			expect(computeBuildSettingsHash(createSettings(overrides))).not.toBe(computeBuildSettingsHash(baseline));
		}
	});

		test('build hash ignores render-only settings', () => {
			const baseline = createSettings();
			const nonBuildCases: Array<Partial<ObsidianInfluxSettings>> = [
				{ showBehaviour: 'OPT_IN' },
				{ exclusionPattern: ['exclude-me'] },
				{ inclusionPattern: ['include-me'] },
				{ requireInfluxFrontmatterKey: !DEFAULT_SETTINGS.requireInfluxFrontmatterKey },
				{ variant: 'ROWS' },
				{ entryHeaderVisible: !DEFAULT_SETTINGS.entryHeaderVisible },
				{ influxAtTopOfPage: !DEFAULT_SETTINGS.influxAtTopOfPage },
			{ fontSize: DEFAULT_SETTINGS.fontSize + 1 },
			{ collapsedPattern: ['collapse-me'] },
				{ collapseAllByDefault: !DEFAULT_SETTINGS.collapseAllByDefault },
				{ showInfluxInSidebar: !DEFAULT_SETTINGS.showInfluxInSidebar },
			];

			for (const overrides of nonBuildCases) {
				expect(computeBuildSettingsHash(createSettings(overrides))).toBe(computeBuildSettingsHash(baseline));
			}
		});

		test('render hash changes for both build-affecting and render-only settings that affect cached reuse', () => {
			const baseline = createSettings();
			const sensitivityCases: Array<Partial<ObsidianInfluxSettings>> = [
				{ sortingPrinciple: 'OLDEST_FIRST' },
				{ listLimit: 42 },
				{ includeFrontmatterLinks: !DEFAULT_SETTINGS.includeFrontmatterLinks },
				{ variant: 'ROWS' },
				{ entryHeaderVisible: !DEFAULT_SETTINGS.entryHeaderVisible },
				{ influxAtTopOfPage: !DEFAULT_SETTINGS.influxAtTopOfPage },
			{ fontSize: DEFAULT_SETTINGS.fontSize + 1 },
			{ collapsedPattern: ['collapse-me'] },
			{ collapseAllByDefault: !DEFAULT_SETTINGS.collapseAllByDefault },
			{ showInfluxInSidebar: !DEFAULT_SETTINGS.showInfluxInSidebar },
		];

			for (const overrides of sensitivityCases) {
				expect(computeRenderSettingsHash(createSettings(overrides))).not.toBe(computeRenderSettingsHash(baseline));
			}
		});

		test('both hashes ignore visibility-only settings that are already covered by settings invalidation', () => {
			const baseline = createSettings();
			const visibilityOnlyCases: Array<Partial<ObsidianInfluxSettings>> = [
				{ showBehaviour: 'OPT_IN' },
				{ exclusionPattern: ['exclude-me'] },
				{ inclusionPattern: ['include-me'] },
				{ requireInfluxFrontmatterKey: !DEFAULT_SETTINGS.requireInfluxFrontmatterKey },
			];

			for (const overrides of visibilityOnlyCases) {
				const changed = createSettings(overrides);
				expect(computeBuildSettingsHash(changed)).toBe(computeBuildSettingsHash(baseline));
				expect(computeRenderSettingsHash(changed)).toBe(computeRenderSettingsHash(baseline));
			}
		});
});

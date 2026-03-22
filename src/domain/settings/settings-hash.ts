/**
 * Pure utility function for computing settings hash
 * Extracted from PreviewManager for testability
 */

import { ObsidianInfluxSettings } from '../../types';

function hashComponents(components: unknown[]): string {
	const str = components.join('|');

	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash &= hash;
	}
	return hash.toString(36);
}

export function computeBuildSettingsHash(settings: ObsidianInfluxSettings): string {
	return hashComponents([
		settings.sortingPrinciple,
		settings.sortingAttribute,
		settings.listLimit,
		settings.sourceBehaviour,
		settings.includeFrontmatterLinks,
		JSON.stringify([...settings.frontmatterProperties].sort()),
		JSON.stringify([...settings.sourceInclusionPattern].sort()),
		JSON.stringify([...settings.sourceExclusionPattern].sort()),
	]);
}

export function computeRenderSettingsHash(settings: ObsidianInfluxSettings): string {
	return hashComponents([
		computeBuildSettingsHash(settings),
		settings.variant,
		settings.entryHeaderVisible,
		settings.influxAtTopOfPage,
		settings.fontSize,
		JSON.stringify([...settings.collapsedPattern].sort()),
		settings.collapseAllByDefault,
		settings.showInfluxInSidebar,
	]);
}

export const computeSettingsHash = computeRenderSettingsHash;

/**
 * Pure utility function for computing settings hash
 * Extracted from PreviewManager for testability
 */

import { ObsidianInfluxSettings } from './types';

/**
 * Computes a hash string from settings that determines if previews should re-render.
 * Any change to these settings will cause the hash to change, triggering a preview update.
 */
export function computeSettingsHash(settings: ObsidianInfluxSettings): string {
    const components = [
        settings.sortingPrinciple,
        settings.sortingAttribute,
        settings.listLimit,
        settings.showBehaviour,
        settings.sourceBehaviour,
        settings.variant,
        settings.entryHeaderVisible,
        settings.influxAtTopOfPage,
        settings.includeFrontmatterLinks,
        JSON.stringify([...settings.frontmatterProperties].sort()),
        settings.fontSize,
        JSON.stringify([...settings.exclusionPattern].sort()),
        JSON.stringify([...settings.inclusionPattern].sort()),
        JSON.stringify([...settings.collapsedPattern].sort()),
        JSON.stringify([...settings.sourceInclusionPattern].sort()),
        JSON.stringify([...settings.sourceExclusionPattern].sort()),
        settings.requireInfluxFrontmatterKey,
        settings.collapseAllByDefault,
        settings.showInfluxInSidebar,
    ];

    const str = components.join('|');

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

import type { CachedMetadata, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, type ObsidianInfluxSettings } from '../../types';
import { logger } from '../../platform/diagnostics/logger';
import { cacheManager } from '../../platform/cache/cache-manager';
import {
	filterBacklinksByFrontmatterProperties,
	filterFrontmatterLinksFromBacklinks,
	validateFrontmatterProperties,
} from './frontmatter-links';
import {
	isIncludableSourceWithMatcher,
	shouldCollapseInfluxWithMatcher,
	shouldShowInfluxWithMatcher,
	type FilterSettings,
} from '../settings/filtering';
import type { BacklinksObject } from '../../types/backlinks';

export interface SettingsOwner {
	data?: {
		settings?: ObsidianInfluxSettings;
	};
}

export class ApiAdapterPolicy {
	constructor(private plugin: SettingsOwner) {}

	getSettings(): ObsidianInfluxSettings {
		const cached = cacheManager.getSettings();
		if (cached) {
			return cached;
		}

		let settings: ObsidianInfluxSettings;
		if (this.plugin?.data?.settings) {
			settings = { ...DEFAULT_SETTINGS, ...this.plugin.data.settings };
		} else {
			logger.warn('Plugin settings not found, using defaults');
			settings = DEFAULT_SETTINGS;
		}

		cacheManager.setSettings(settings);
		this.preCompileRegexPatterns(settings);
		return settings;
	}

	applyBacklinkPolicy(params: {
		backlinks: BacklinksObject;
		targetBasename: string;
		settings: ObsidianInfluxSettings;
		resolveMetadataByPath: (path: string) => CachedMetadata | null;
	}): void {
		const { backlinks, targetBasename, settings, resolveMetadataByPath } = params;

		if (!settings.includeFrontmatterLinks) {
			filterFrontmatterLinksFromBacklinks(backlinks, targetBasename, resolveMetadataByPath);
			return;
		}

		const allowedProperties = validateFrontmatterProperties(settings.frontmatterProperties);
		if (allowedProperties.length > 0) {
			filterBacklinksByFrontmatterProperties(
				backlinks,
				targetBasename,
				allowedProperties,
				resolveMetadataByPath
			);
		}
	}

	preCompileRegexPatterns(settings: Partial<ObsidianInfluxSettings>): void {
		const allPatterns = [
			...(settings.inclusionPattern || []),
			...(settings.exclusionPattern || []),
			...(settings.collapsedPattern || []),
			...(settings.sourceInclusionPattern || []),
			...(settings.sourceExclusionPattern || []),
		];

		for (const pattern of allPatterns) {
			if (!pattern || pattern.length === 0) {
				continue;
			}
			const cachedRegex = cacheManager.getRegex(pattern);
			if (cachedRegex === undefined) {
				try {
					cacheManager.setRegex(pattern, new RegExp(pattern));
				} catch (err) {
					logger.error('Invalid regex pattern: ' + pattern, { pattern, error: err });
					cacheManager.setInvalidRegex(pattern);
				}
			}
		}
	}

	getShowStatus(file: TFile, metadata: CachedMetadata | null | undefined): boolean {
		const settings = this.getSettings();
		return shouldShowInfluxWithMatcher(file.path, settings as FilterSettings, this.patternMatchingFn, metadata);
	}

	isIncludableSource(path: string): boolean {
		const settings = this.getSettings();
		return isIncludableSourceWithMatcher(path, settings as FilterSettings, this.patternMatchingFn);
	}

	getCollapsedStatus(file: TFile): boolean {
		const settings = this.getSettings();
		if (settings.collapseAllByDefault) {
			return true;
		}
		return shouldCollapseInfluxWithMatcher(file.path, settings as FilterSettings, this.patternMatchingFn);
	}

	patternMatchingFn = (path: string, rawPatterns: string[]): boolean => {
		const patterns = rawPatterns
			.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0)
			.map((pattern) => pattern.trim());

		return patterns.some((pattern) => {
			const cachedRegex = cacheManager.getRegex(pattern);
			if (cachedRegex !== undefined) {
				return cachedRegex === null ? false : cachedRegex.test(path);
			}

			try {
				const regex = new RegExp(pattern);
				cacheManager.setRegex(pattern, regex);
				return regex.test(path);
			} catch (err) {
				logger.error('Invalid regex pattern: ' + pattern, { pattern, error: err });
				cacheManager.setInvalidRegex(pattern);
				return false;
			}
		});
	};
}

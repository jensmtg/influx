import { App, TFile, CachedMetadata, LinkCache, Component } from 'obsidian';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from '../../types';
import { logger } from '../../platform/diagnostics/logger';
import type { BacklinksObject } from '../../types/backlinks';
import {
    processFrontmatterLinks,
    filterFrontmatterLinksFromBacklinks
} from './frontmatter-links';
import {
    compareLinkName,
    shouldShowInfluxWithMatcher,
    isIncludableSourceWithMatcher,
    shouldCollapseInfluxWithMatcher,
    type FilterSettings
} from '../settings/filtering';
import { cacheManager } from '../../platform/cache/cache-manager';
import { recordMetric } from '../../platform/diagnostics/metrics';

interface SettingsOwner {
	data?: {
		settings?: ObsidianInfluxSettings;
	};
}

export class ApiAdapter extends Component {
    app: App;
    private plugin: SettingsOwner;

    constructor(app: App, plugin: SettingsOwner) {
        super();
        this.app = app;
        this.plugin = plugin;
    }
    
    /** =================
     * OBSIDIAN resources
     * ==================
     */
    getFileByPath(path: string): TFile | null {
        // Check cache first to reduce I/O
        const cached = cacheManager.getFile(path);
        if (cached) {
            return cached;
        }

        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            cacheManager.setFile(path, file);
            return file;
        }
        return null;
    }
    async readFile(file: TFile): Promise<string> {
        return await this.app.vault.read(file);
    }
    getMetadata(file: TFile): CachedMetadata {
        return this.app.metadataCache.getFileCache(file);
    }
    getBacklinks(file: TFile): BacklinksObject {
        const settings = this.getSettings();
        const startTime = performance.now();

        const reportFetchMetric = (backlinks: BacklinksObject): BacklinksObject => {
            const backlinksSourceCount = backlinks?.data instanceof Map
                ? backlinks.data.size
                : Object.keys(backlinks?.data || {}).length;
            recordMetric({
                name: 'influx.backlinks.fetch',
                mode: 'shared',
                durationMs: performance.now() - startTime,
                settings,
                ctx: {
                    filePath: file.path,
                    backlinksSourceCount,
                    includeFrontmatterLinks: settings.includeFrontmatterLinks,
                }
            });
            return backlinks;
        };

        // Check cache first to reduce I/O
        const cacheKey = file.path;
        const cached = cacheManager.getBacklinks(cacheKey);
        if (cached) {
            return reportFetchMetric(cached);
        }

        // Runtime check for getBacklinksForFile availability
        let backlinks: BacklinksObject;
        type MetadataCacheWithBacklinks = typeof this.app.metadataCache & {
            getBacklinksForFile?: (file: TFile) => BacklinksObject;
        };
        const metadataCache = this.app.metadataCache as MetadataCacheWithBacklinks;

        if (typeof metadataCache?.getBacklinksForFile === 'function') {
            backlinks = metadataCache.getBacklinksForFile(file);
        } else {
            logger.warn('getBacklinksForFile not available, returning empty backlinks');
            backlinks = { data: new Map() };
        }

        // Filter out frontmatter links if disabled
        if (!settings.includeFrontmatterLinks) {
            filterFrontmatterLinksFromBacklinks(
                backlinks,
                file.basename,
                (path: string) => {
                    const tFile = this.getFileByPath(path);
                    return tFile ? this.getMetadata(tFile) : null;
                }
            );
        }

        const metadata = this.app.metadataCache.getFileCache(file);

        // Process front matter links using the pure function pipeline (only if enabled)
        if (metadata?.frontmatterLinks && Array.isArray(metadata.frontmatterLinks) && settings.includeFrontmatterLinks) {
            processFrontmatterLinks(backlinks, metadata.frontmatterLinks, settings);
        }

        cacheManager.setBacklinks(cacheKey, backlinks);
        return reportFetchMetric(backlinks);
    }
    getSettings(): ObsidianInfluxSettings {
        // Return cached settings to reduce property access overhead
        const cached = cacheManager.getSettings();
        if (cached) {
            return cached;
        }

        // Access settings directly from plugin instance
        let settings: ObsidianInfluxSettings;
        if (this.plugin?.data?.settings) {
            settings = { ...DEFAULT_SETTINGS, ...this.plugin.data.settings };
        } else {
            logger.warn('Plugin settings not found, using defaults');
            settings = DEFAULT_SETTINGS;
        }

        cacheManager.setSettings(settings);
        // Pre-compile all regex patterns to eliminate JIT overhead on critical path
        this.preCompileRegexPatterns(settings);
        return settings;
    }
    /** Clear all caches - call when settings change or files are modified */
    clearCache(): void {
        cacheManager.clearAll();
    }
    /** Invalidate settings cache - call when settings are changed via UI */
    invalidateSettingsCache(): void {
        cacheManager.invalidateSettingsCache();
    }
    /** Invalidate cache for a specific file - call when file is modified/renamed/deleted */
    invalidateFileCache(path: string): void {
        cacheManager.invalidateFile(path);
    }
    /** Pre-compile all regex patterns from settings to eliminate JIT overhead on critical path */
    preCompileRegexPatterns(settings: Partial<ObsidianInfluxSettings>): void {
        // Collect all pattern arrays from settings
        const allPatterns = [
            ...(settings.inclusionPattern || []),
            ...(settings.exclusionPattern || []),
            ...(settings.collapsedPattern || []),
            ...(settings.sourceInclusionPattern || []),
            ...(settings.sourceExclusionPattern || []),
        ];

        // Pre-compile all patterns to populate the cache
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
                    // Cache sentinel to prevent repeated error logging
                    cacheManager.setInvalidRegex(pattern);
                }
            }
        }
    }
    /** =================
     * INFLUX utils 
     * ==================
     */
    /** For a given file, should Influx component be shown on it's page? */
    getShowStatus(file: TFile): boolean {
        const settings = this.getSettings();
        const metadata = this.getMetadata(file);
        // Use extracted pure function with our cached pattern matcher
        return shouldShowInfluxWithMatcher(file.path, settings as FilterSettings, this.patternMatchingFn, metadata);
    }
    isIncludableSource(path: string): boolean {
        const settings = this.getSettings();
        // Use extracted pure function with our cached pattern matcher
        return isIncludableSourceWithMatcher(path, settings as FilterSettings, this.patternMatchingFn);
    }
    /** For a given file, should Influx component be shown as collapsed on it's page? */
    getCollapsedStatus(file: TFile): boolean {
        const settings = this.getSettings();
        // Global setting takes precedence over pattern matching
        if (settings.collapseAllByDefault) {
            return true;
        }
        // Use extracted pure function with our cached pattern matcher
        return shouldCollapseInfluxWithMatcher(file.path, settings as FilterSettings, this.patternMatchingFn);
    }
	    patternMatchingFn = (path: string, _patterns: string[]): boolean => {
	        const patterns = _patterns
	            .filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0)
	            .map(pattern => pattern.trim());
	        const pathMatchesRegex = (pattern: string): boolean => {
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
	                // Cache sentinel to prevent repeated error logging
	                cacheManager.setInvalidRegex(pattern);
	                return false;
	            }
	        };
	        const matched = patterns.some(pathMatchesRegex);
	        return matched
	    };
    /** comparison fn for filter in function to make contextual summaries,
     * to find relevant links.
     * Delegates to the pure function in settings-utils.
     */
    compareLinkName(link: LinkCache, basename: string): boolean {
        return compareLinkName(link, basename);
    }
}

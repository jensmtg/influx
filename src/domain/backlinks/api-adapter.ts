import { App, TFile, CachedMetadata, LinkCache, Component } from 'obsidian';
import { logger } from '../../platform/diagnostics/logger';
import type { BacklinksObject } from '../../types/backlinks';
import { compareLinkName } from '../settings/filtering';
import { cacheManager } from '../../platform/cache/cache-manager';
import { recordMetric } from '../../platform/diagnostics/metrics';
import { ApiAdapterPolicy, type SettingsOwner } from './api-adapter-policy';

export class ApiAdapter extends Component {
    app: App;
    private plugin: SettingsOwner;
    private policy: ApiAdapterPolicy;

    private cloneBacklinks(backlinks: BacklinksObject): BacklinksObject {
		if (!backlinks?.data) {
			return { data: new Map() };
		}

		if (backlinks.data instanceof Map) {
			return {
				data: new Map(
					Array.from(backlinks.data.entries(), ([path, links]) => [path, [...links]])
				),
			};
		}

		return {
			data: Object.fromEntries(
				Object.entries(backlinks.data).map(([path, links]) => [path, [...links]])
			),
		};
	}

    constructor(app: App, plugin: SettingsOwner) {
        super();
        this.app = app;
        this.plugin = plugin;
        this.policy = new ApiAdapterPolicy(plugin);
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
    getMetadata(file: TFile): CachedMetadata | null {
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
			backlinks = this.cloneBacklinks(metadataCache.getBacklinksForFile(file));
        } else {
            logger.warn('getBacklinksForFile not available, returning empty backlinks');
            backlinks = { data: new Map() };
        }

		this.policy.applyBacklinkPolicy({
			backlinks,
			targetBasename: file.basename,
			settings,
			resolveMetadataByPath: (path: string) => {
				const tFile = this.getFileByPath(path);
				return tFile ? this.getMetadata(tFile) : null;
			},
		});

		cacheManager.setBacklinks(cacheKey, backlinks);
		return reportFetchMetric(backlinks);
	}
	getSettings() {
		return this.policy.getSettings();
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
    preCompileRegexPatterns(settings: Parameters<ApiAdapterPolicy['preCompileRegexPatterns']>[0]): void {
		this.policy.preCompileRegexPatterns(settings);
    }
    /** =================
     * INFLUX utils 
     * ==================
     */
    /** For a given file, should Influx component be shown on it's page? */
    getShowStatus(file: TFile): boolean {
		return this.policy.getShowStatus(file, this.getMetadata(file));
    }
    isIncludableSource(path: string): boolean {
		return this.policy.isIncludableSource(path);
    }
    /** For a given file, should Influx component be shown as collapsed on it's page? */
    getCollapsedStatus(file: TFile): boolean {
		return this.policy.getCollapsedStatus(file);
    }
    /** comparison fn for filter in function to make contextual summaries,
     * to find relevant links.
     * Delegates to the pure function in settings-utils.
     */
    compareLinkName(link: LinkCache, basename: string): boolean {
        return compareLinkName(link, basename);
    }
}

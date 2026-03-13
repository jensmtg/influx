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

	private getResolvedBacklinkSourcePaths(file: TFile): string[] | null {
		type MetadataCacheWithResolvedLinks = typeof this.app.metadataCache & {
			resolvedLinks?: Record<string, Record<string, number>>;
		};

		const resolvedLinks = (this.app.metadataCache as MetadataCacheWithResolvedLinks)?.resolvedLinks;
		if (!resolvedLinks || typeof resolvedLinks !== 'object') {
			return null;
		}

		const targetPath = file.path;
		return Object.entries(resolvedLinks)
			.filter(([sourcePath, targets]) => sourcePath !== targetPath && typeof targets?.[targetPath] === 'number' && targets[targetPath] > 0)
			.map(([sourcePath]) => sourcePath);
	}

	private buildLinkCachesForResolvedSource(sourcePath: string, targetFile: TFile): LinkCache[] {
		const sourceFile = this.getFileByPath(sourcePath);
		const sourceMetadata = sourceFile ? this.getMetadata(sourceFile) : null;
		const links = sourceMetadata?.links?.filter((link) => this.compareLinkName(link, targetFile.basename));
		if (links && links.length > 0) {
			return links.map((link) => ({ ...link }));
		}

		return [{
			link: targetFile.basename,
			displayText: targetFile.basename,
			position: {
				start: { line: 999999, col: 0, offset: 0 },
				end: { line: 999999, col: 0, offset: 0 },
			},
			original: `[[${targetFile.basename}]]`,
		}];
	}

	private reconcileBacklinksWithResolvedLinks(file: TFile, backlinks: BacklinksObject): BacklinksObject {
		const resolvedSourcePaths = this.getResolvedBacklinkSourcePaths(file);
		if (!resolvedSourcePaths) {
			return backlinks;
		}

		const resolvedSet = new Set(resolvedSourcePaths);
		if (backlinks.data instanceof Map) {
			for (const sourcePath of Array.from(backlinks.data.keys())) {
				if (!resolvedSet.has(sourcePath)) {
					backlinks.data.delete(sourcePath);
				}
			}

			for (const sourcePath of resolvedSourcePaths) {
				if (!backlinks.data.has(sourcePath)) {
					backlinks.data.set(sourcePath, this.buildLinkCachesForResolvedSource(sourcePath, file));
				}
			}
			return backlinks;
		}

		for (const sourcePath of Object.keys(backlinks.data)) {
			if (!resolvedSet.has(sourcePath)) {
				delete backlinks.data[sourcePath];
			}
		}

		for (const sourcePath of resolvedSourcePaths) {
			if (!backlinks.data[sourcePath]) {
				backlinks.data[sourcePath] = this.buildLinkCachesForResolvedSource(sourcePath, file);
			}
		}

		return backlinks;
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
	private fetchBacklinks(file: TFile, options?: { useCache?: boolean; writeCache?: boolean }): BacklinksObject {
		const useCache = options?.useCache !== false;
		const writeCache = options?.writeCache !== false;
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
		if (useCache) {
			const cached = cacheManager.getBacklinks(cacheKey);
			if (cached) {
				return reportFetchMetric(cached);
			}
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

		backlinks = this.reconcileBacklinksWithResolvedLinks(file, backlinks);

		this.policy.applyBacklinkPolicy({
			backlinks,
			targetBasename: file.basename,
			settings,
			resolveMetadataByPath: (path: string) => {
				const tFile = this.getFileByPath(path);
				return tFile ? this.getMetadata(tFile) : null;
			},
		});

		if (writeCache) {
			cacheManager.setBacklinks(cacheKey, backlinks);
		}
		return reportFetchMetric(backlinks);
	}
	getBacklinks(file: TFile): BacklinksObject {
		return this.fetchBacklinks(file);
	}
	getBacklinksFresh(file: TFile): BacklinksObject {
		return this.fetchBacklinks(file, { useCache: false, writeCache: false });
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

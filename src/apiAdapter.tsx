import { App, TFile, CachedMetadata, LinkCache, MarkdownRenderer, Component, getLinkpath } from 'obsidian';
import { InlinkingFile } from './InlinkingFile';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from './main';
import { processFrontmatterLinks } from './frontmatter-utils';
import {
    compareLinkName,
    createInlinkingFileComparator,
    shouldShowInfluxWithMatcher,
    isIncludableSourceWithMatcher,
    shouldCollapseInfluxWithMatcher,
    type FilterSettings
} from './settings-utils';
import {
    getBacklinkSourcePaths,
} from './backlink-utils';
import {
    getFreshBacklinks,
    isBacklinkCacheActive,
    type BacklinkMetadataCache,
} from './backlink-cache';
import { createConcurrencyLimiter, mapWithConcurrency } from './async-utils';
import { setRenderedLinkSources } from './render-utils';
import { processTitleHTML } from './link-utils';

const MAX_BACKLINK_CACHE_ENTRIES = 32;
const MAX_CONCURRENT_BACKLINK_LOADS = 8;
const MAX_CONCURRENT_RENDER_JOBS = 8;

export type BacklinksObject = {
    data: Map<string, LinkCache[]> | Record<string, LinkCache[]>;
    /** Stable native source paths captured before optional relationship augmentation. */
    incomingSourcePaths?: readonly string[];
    /** Unmodified incoming links returned by Obsidian. */
    incomingData?: Map<string, LinkCache[]> | Record<string, LinkCache[]>;
}
export type ExtendedInlinkingFile = {
    inlinkingFile: InlinkingFile;
    titleInnerHTML: string;
    innerHTML: string;
}

type BacklinkLoadResult = {
    backlinks: BacklinksObject;
    generation: number;
}

export class ApiAdapter {
    app: App;
    // Keep unresolved requests separate so the LRU never evicts active work and
    // concurrent consumers of one target always share the same vault scan.
    private backlinkRequests: Map<string, Promise<BacklinkLoadResult>> = new Map();
    private backlinksCache: Map<string, BacklinksObject> = new Map();
    private backlinkLoadLimiter = createConcurrencyLimiter(MAX_CONCURRENT_BACKLINK_LOADS);
    private renderLimiter = createConcurrencyLimiter(MAX_CONCURRENT_RENDER_JOBS);
    private backlinkProvider: readonly unknown[] = [];
    private backlinkGeneration = 0;
    private disposed = false;
    private settingsCache: ObsidianInfluxSettings | null = null;
    // Cache compiled regex patterns to avoid recompilation on every pattern match
    // Use null as a sentinel value for invalid regex patterns
    private regexCache: Map<string, RegExp | null> = new Map();
    // Sentinel value to mark invalid regex patterns
    private static readonly INVALID_REGEX_SENTINEL: RegExp | null = null;

    constructor(app: App) {
        this.app = app;
    }
    
    /** =================
     * OBSIDIAN resources
     * ==================
     */
    getFileByPath(path: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? file : null;
    }
    async readFile(file: TFile): Promise<string> {
        return await this.app.vault.cachedRead(file);
    }
    getMetadata(file: TFile): CachedMetadata | null {
        return this.app.metadataCache.getFileCache(file);
    }
    async getBacklinks(file: TFile): Promise<BacklinksObject> {
        if (this.disposed) {
            throw new Error('[Influx] Backlink adapter has been unloaded');
        }

        this.syncBacklinkProvider();

        const path = file.path;
        const cached = this.backlinksCache.get(path);
        if (cached) {
            // Refresh insertion order so the bounded map behaves as an LRU.
            this.backlinksCache.delete(path);
            this.backlinksCache.set(path, cached);
            return cached;
        }

        const pending = this.backlinkRequests.get(path);
        if (pending) {
            return this.resolveBacklinkRequest(file, path, pending);
        }

        const request = this.loadCurrentBacklinks(file);
        this.backlinkRequests.set(path, request);

        return this.resolveBacklinkRequest(file, path, request);
    }

    private async resolveBacklinkRequest(
        file: TFile,
        path: string,
        request: Promise<BacklinkLoadResult>,
    ): Promise<BacklinksObject> {
        try {
            const { backlinks, generation } = await request;
            this.syncBacklinkProvider();
            if (generation !== this.backlinkGeneration) {
                if (this.backlinkRequests.get(path) === request) {
                    this.backlinkRequests.delete(path);
                }
                return this.getBacklinks(file);
            }
            if (this.backlinkRequests.get(path) === request) {
                this.backlinkRequests.delete(path);
                this.cacheBacklinks(path, backlinks);
            }
            return backlinks;
        } catch (error) {
            if (this.backlinkRequests.get(path) === request) {
                this.backlinkRequests.delete(path);
            }
            throw error;
        }
    }

    private syncBacklinkProvider(): void {
        const provider = (this.app.metadataCache as BacklinkMetadataCache).getBacklinksForFile;
        const current = [provider, provider?.safe, provider?.originalFn];
        if (current.some((value, index) => value !== this.backlinkProvider[index])) {
            this.backlinkProvider = current;
            this.invalidateBacklinksCache();
        }
    }

    private async loadCurrentBacklinks(file: TFile): Promise<BacklinkLoadResult> {
        while (!this.disposed) {
            const result = await this.backlinkLoadLimiter.run(async () => {
                if (this.disposed) {
                    throw new Error('[Influx] Backlink adapter has been unloaded');
                }
                const generation = this.backlinkGeneration;
                const backlinks = await this.loadBacklinks(file);
                return { backlinks, generation };
            });
            if (result.generation === this.backlinkGeneration) {
                return result;
            }
        }
        throw new Error('[Influx] Backlink adapter has been unloaded');
    }

    private cacheBacklinks(path: string, backlinks: BacklinksObject): void {
        // Retry empty results on the next request. They can be returned while
        // Obsidian or an optional backlink provider is still starting up.
        if (getBacklinkSourcePaths(backlinks).length === 0) {
            return;
        }
        this.backlinksCache.set(path, backlinks);
        if (this.backlinksCache.size > MAX_BACKLINK_CACHE_ENTRIES) {
            const oldestPath = this.backlinksCache.keys().next().value;
            if (oldestPath !== undefined) {
                this.backlinksCache.delete(oldestPath);
            }
        }
    }

    private async loadBacklinks(file: TFile): Promise<BacklinksObject> {
        const settings = this.getSettings();
        const rawBacklinks = await getFreshBacklinks(
            this.app.metadataCache as BacklinkMetadataCache,
            file,
            settings.useBacklinkCache,
        );
        // Frontmatter processing adds entries, so clone the native cache instead
        // of mutating Obsidian's shared metadata object.
        const backlinks = this.cloneBacklinks(rawBacklinks);
        const incomingSourcePaths = getBacklinkSourcePaths(rawBacklinks);
        const metadata = this.app.metadataCache.getFileCache(file);
        
        // Process front matter links using the pure function pipeline
        if (metadata?.frontmatterLinks) {
            processFrontmatterLinks(backlinks, metadata.frontmatterLinks, settings);
        }

        // The target note's own frontmatter links are outbound relationships.
        // Keep native incoming paths separate so they cannot make a zero-inlink
        // note look backlinked or trigger editor processing on their own.
        backlinks.incomingSourcePaths = incomingSourcePaths;
        
        return backlinks;
    }

    isBacklinkCacheActive(): boolean {
        return isBacklinkCacheActive(this.app.metadataCache as BacklinkMetadataCache);
    }

    private cloneBacklinks(backlinks: BacklinksObject | null | undefined): BacklinksObject {
        const data = backlinks?.data;
        if (data instanceof Map) {
            return {
                data: new Map(
                    Array.from(data.entries())
                        .filter(([path, links]) => typeof path === 'string' && Array.isArray(links))
                        .map(([path, links]) => [path, [...links]]),
                ),
            };
        }

        const clonedData: Record<string, LinkCache[]> = Object.create(null);
        for (const [path, links] of Object.entries(data || {})) {
            if (Array.isArray(links)) clonedData[path] = [...links];
        }
        return { data: clonedData };
    }
    async renderMarkdown(markdown: string, sourcePath: string): Promise<string> {
        return this.renderLimiter.run(() => this.renderMarkdownNow(markdown, sourcePath));
    }
    private async renderMarkdownNow(markdown: string, sourcePath: string): Promise<string> {
        if (this.disposed) throw new Error('[Influx] Backlink adapter has been unloaded');
        if (!markdown) return '';
        const div = document.createElement('div');
        const renderComponent = new Component();
        renderComponent.load();
        try {
            await MarkdownRenderer.render(this.app, markdown, div, sourcePath, renderComponent);
            setRenderedLinkSources(div, sourcePath, (linktext, parentPath) =>
                this.app.metadataCache.getFirstLinkpathDest(getLinkpath(linktext), parentPath)?.path,
            );

            // Disable checkboxes in preview mode to prevent interaction.
            const checkboxes = Array.from(div.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
            for (const checkbox of checkboxes) {
                checkbox.disabled = true;
            }
            return div.innerHTML;
        } finally {
            // Rendering children are no longer needed after the HTML snapshot.
            renderComponent.unload();
        }
    }
    getSettings(): ObsidianInfluxSettings {
        // Return cached settings to reduce property access overhead
        if (this.settingsCache) {
            return this.settingsCache;
        }

        // @ts-expect-error - plugins.plugins is not officially typed in App
        const settings = this.app.plugins?.plugins?.influx?.data?.settings ?? DEFAULT_SETTINGS;
        // Ensure we have a complete settings object
        this.settingsCache = { ...DEFAULT_SETTINGS, ...settings } as ObsidianInfluxSettings;
        // Pre-compile all regex patterns to eliminate JIT overhead on critical path
        this.preCompileRegexPatterns(this.settingsCache);
        return this.settingsCache;
    }
    /** Clear all caches - call when settings change or files are modified */
    clearCache(): void {
        this.backlinkGeneration++;
        this.backlinksCache.clear();
        this.settingsCache = null;
        this.regexCache.clear();
    }
    /** Start a fresh event-driven backlink update batch. */
    invalidateBacklinksCache(): void {
        this.backlinkGeneration++;
        this.backlinksCache.clear();
    }
    /** File renames/deletions can invalidate path and backlink lookups. */
    invalidateFileCache(): void {
        this.backlinkGeneration++;
        // A TFile's path can change during a rename. Do not let an old request
        // be reused for a future file that takes its previous path.
        this.backlinkRequests.clear();
        this.backlinksCache.clear();
    }
    /** Invalidate settings cache - call when settings are changed via UI */
    invalidateSettingsCache(): void {
        this.settingsCache = null;
        this.regexCache.clear(); // Clear regex cache so new patterns are compiled
        this.backlinkGeneration++;
        this.backlinksCache.clear();
    }

    /** Stop queued work and release all local references during plugin unload. */
    dispose(): void {
        this.disposed = true;
        this.backlinkGeneration++;
        this.backlinkLoadLimiter.cancelQueued(
            new Error('[Influx] Backlink adapter has been unloaded'),
        );
        this.renderLimiter.cancelQueued(new Error('[Influx] Backlink adapter has been unloaded'));
        this.backlinkRequests.clear();
        this.backlinksCache.clear();
        this.settingsCache = null;
        this.regexCache.clear();
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
            if (pattern && pattern.length > 0 && !this.regexCache.has(pattern)) {
                try {
                    this.regexCache.set(pattern, new RegExp(pattern));
                } catch (err) {
                    console.error('[Influx] Invalid regex pattern: ' + pattern);
                    // Cache sentinel to prevent repeated error logging
                    this.regexCache.set(pattern, ApiAdapter.INVALID_REGEX_SENTINEL);
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
        // Use extracted pure function with our cached pattern matcher
        return shouldShowInfluxWithMatcher(file.path, settings as FilterSettings, this.patternMatchingFn);
    }
    isIncludableSource(path: string): boolean {
        const settings = this.getSettings();
        // Use extracted pure function with our cached pattern matcher
        return isIncludableSourceWithMatcher(path, settings as FilterSettings, this.patternMatchingFn);
    }
    /** For a given file, should Influx component be shown as collapsed on it's page? */
    getCollapsedStatus(file: TFile): boolean {
        const settings = this.getSettings();
        // Use extracted pure function with our cached pattern matcher
        return shouldCollapseInfluxWithMatcher(file.path, settings as FilterSettings, this.patternMatchingFn);
    }
    patternMatchingFn = (path: string, _patterns: string[]): boolean => {
        const patterns = _patterns.filter((_path: string) => _path.length > 0)
        const pathMatchesRegex = (pattern: string): boolean => {
            try {
                // Use cached regex if available, otherwise compile and cache it
                let regex = this.regexCache.get(pattern);
                // Check if this is a known invalid pattern
                if (regex === ApiAdapter.INVALID_REGEX_SENTINEL) {
                    return false;
                }
                if (!regex) {
                    regex = new RegExp(pattern);
                    this.regexCache.set(pattern, regex);
                }
                return regex.test(path);
            } catch (err) {
                console.error('[Influx] Invalid regex pattern: ' + pattern);
                // Cache sentinel to prevent repeated error logging
                this.regexCache.set(pattern, ApiAdapter.INVALID_REGEX_SENTINEL);
                return false;
            }
        };
        const matched = patterns.some(pathMatchesRegex);
        return matched
    };
    /** A sort function to order notes correctly, based on settings. */
    makeComparisonFn(): (a: InlinkingFile, b: InlinkingFile) => 0 | 1 | -1 {
        const settings = this.getSettings();
        // Use extracted pure function for file comparison
        return createInlinkingFileComparator(settings) as (a: InlinkingFile, b: InlinkingFile) => 0 | 1 | -1;
    }
    /** Sort source files before any file reads or Markdown parsing. */
    sortFilesForRendering(files: TFile[]): TFile[] {
        const settings = this.getSettings();
        const comparator = createInlinkingFileComparator(settings);
        return [...files].sort((a, b) => comparator({ file: a }, { file: b }));
    }
    async renderAllMarkdownBlocks(inlinkingsFiles: InlinkingFile[]): Promise<ExtendedInlinkingFile[]> {
        const settings: Partial<ObsidianInfluxSettings> = this.getSettings()
        const comparator = this.makeComparisonFn()
        const selectedFiles = inlinkingsFiles
            .slice()
            .sort(comparator)
            .slice(0, settings.listLimit || inlinkingsFiles.length)
        const components = await mapWithConcurrency(
            selectedFiles,
            MAX_CONCURRENT_RENDER_JOBS,
            async (inlinkingFile) => {
                try {
                    const [titleAsMd, summaryAsMd] = await Promise.all([
                        this.renderMarkdown(inlinkingFile.title ? `_${inlinkingFile.title}` : '', inlinkingFile.file.path),
                        this.renderMarkdown(inlinkingFile.summary, inlinkingFile.file.path),
                    ])
                    return {
                        inlinkingFile,
                        titleInnerHTML: processTitleHTML(titleAsMd),
                        innerHTML: summaryAsMd,
                    }
                } catch (error) {
                    if (!this.disposed) console.error(`[Influx] Failed to render ${inlinkingFile.file.path}:`, error);
                    return null;
                }
            },
        )
        return components.filter((component): component is ExtendedInlinkingFile => component !== null)
    }
    /** Resolve from the source note so duplicate names and relative links match correctly. */
    isLinkToFile(link: LinkCache, sourcePath: string, target: TFile): boolean {
        if (typeof link?.link !== 'string') return false;
        return this.app.metadataCache.getFirstLinkpathDest(getLinkpath(link.link), sourcePath)?.path === target.path;
    }
    /** comparison fn for filter in function to make contextual summaries,
     * to find relevant links.
     * Delegates to the pure function in settings-utils.
     */
    compareLinkName(link: LinkCache, basename: string): boolean {
        return compareLinkName(link, basename);
    }
}

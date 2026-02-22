import { App, TFile, CachedMetadata, LinkCache, MarkdownRenderer, Component } from 'obsidian';
import { InlinkingFile } from './InlinkingFile';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from './types';
import ObsidianInflux from './main';
import { logger } from './utils/logger';
import {
    processFrontmatterLinks,
    filterFrontmatterLinksFromBacklinks
} from './frontmatter-utils';
import {
    compareLinkName,
    createInlinkingFileComparator,
    shouldShowInfluxWithMatcher,
    isIncludableSourceWithMatcher,
    shouldCollapseInfluxWithMatcher,
    type FilterSettings
} from './settings-utils';
import { cacheManager } from './state/CacheManager';
import { mapWithConcurrency } from './utils/concurrency';
import { CONSTANTS } from './constants';
import { recordMetric } from './utils/metrics';

export type BacklinksObject = { data: Map<string, LinkCache[]> | { [key: string]: LinkCache[] } }
export type ExtendedInlinkingFile = {
    inlinkingFile: InlinkingFile;
    titleInnerHTML: string;
    inner: HTMLDivElement;
}

export class ApiAdapter extends Component {
    app: App;
    private plugin: ObsidianInflux;

    constructor(app: App, plugin: ObsidianInflux) {
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
    async renderMarkdown(markdown: string): Promise<HTMLDivElement> {
        const div = document.createElement('div');
        await MarkdownRenderer.renderMarkdown(markdown, div, '/', this);

        // Disable checkboxes in preview mode to prevent interaction
        // Use direct DOM manipulation instead of innerHTML replacement for better performance
        const checkboxes = Array.from(div.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
        for (const checkbox of checkboxes) {
            checkbox.disabled = true;
        }
        return div;
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
        const patterns = _patterns.filter((_path: string) => _path.length > 0)
        const pathMatchesRegex = (pattern: string): boolean => {
            try {
                // Use cached regex if available, otherwise compile and cache it
                const cachedRegex = cacheManager.getRegex(pattern);
                if (cachedRegex === null) {
                    return false;
                }
                const regex = cachedRegex ?? new RegExp(pattern);
                if (!cachedRegex) {
                    cacheManager.setRegex(pattern, regex);
                }
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
    /** A sort function to order notes correctly, based on settings. */
    makeComparisonFn(): (a: InlinkingFile, b: InlinkingFile) => 0 | 1 | -1 {
        const settings = this.getSettings();
        logger.debug('Creating comparison function', {
            attribute: settings.sortingAttribute,
            principle: settings.sortingPrinciple
        });
        // Use extracted pure function for file comparison
        return createInlinkingFileComparator(settings) as (a: InlinkingFile, b: InlinkingFile) => 0 | 1 | -1;
    }
    private sanitizeRenderedTitleHtml(html: string): string {
        return html
            .replace(/<\/?p[^>]*>/gi, '')      // Remove <p>, </p> tags
            .replace(/<\/?h[1-6][^>]*>/gi, '') // Remove <h1-h6>, </h1-h6> tags
            .replace(/(\r\n|\n|\r)+/g, ' ')    // Replace newlines with a single space
            .replace(/^_/, '')                 // Remove leading underscore
            .trim();
    }
    private sanitizeRenderedSummaryHtml(html: string): string {
        return html
            .replace(/<\/?p[^>]*>/gi, '')      // Remove <p>, </p> tags
            .replace(/<\/?h[1-6][^>]*>/gi, '') // Remove <h1-h6>, </h1-h6> tags
            .replace(/(\r\n|\n|\r)+/g, ' ')    // Replace newlines with a single space
            .trim();
    }
    async renderAllMarkdownBlocks(inlinkingsFiles: InlinkingFile[], targetFilePath?: string): Promise<ExtendedInlinkingFile[]> {
        const settings: Partial<ObsidianInfluxSettings> = this.getSettings()
        const startTime = performance.now();
        const comparator = this.makeComparisonFn()
        const sortedFiles = [...inlinkingsFiles].sort(comparator);
        const limitedFiles = sortedFiles.slice(0, settings.listLimit || sortedFiles.length);

        const rendered = await mapWithConcurrency(
            limitedFiles,
            CONSTANTS.MARKDOWN_RENDER_CONCURRENCY,
            async (inlinkingFile): Promise<ExtendedInlinkingFile | null> => {
                try {
                    // Render title and summary together per file; global concurrency is capped above.
                    const [titleAsMd, summaryAsMd] = await Promise.all([
                        this.renderMarkdown(`_${inlinkingFile.title}`),
                        this.renderMarkdown(inlinkingFile.summary),
                    ])

                    const titleInnerHTML = this.sanitizeRenderedTitleHtml(titleAsMd.innerHTML);
                    summaryAsMd.innerHTML = this.sanitizeRenderedSummaryHtml(summaryAsMd.innerHTML);

                    const extended: ExtendedInlinkingFile = {
                        inlinkingFile: inlinkingFile,
                        titleInnerHTML: titleInnerHTML,
                        inner: summaryAsMd,
                    }
                    return extended
                } catch (error) {
                    logger.error('Failed to render markdown block', { filePath: inlinkingFile.file?.path, error });
                    return null;
                }
            }
        );

        const components = rendered.filter((component): component is ExtendedInlinkingFile => component !== null);
        recordMetric({
            name: 'influx.markdown.render',
            mode: 'shared',
            durationMs: performance.now() - startTime,
            settings,
            ctx: {
                filePath: targetFilePath,
                inputCount: inlinkingsFiles.length,
                renderedCount: components.length,
                markdownConcurrency: CONSTANTS.MARKDOWN_RENDER_CONCURRENCY,
            }
        });
        return components;
    }
    /** comparison fn for filter in function to make contextual summaries,
     * to find relevant links.
     * Delegates to the pure function in settings-utils.
     */
    compareLinkName(link: LinkCache, basename: string): boolean {
        return compareLinkName(link, basename);
    }
}

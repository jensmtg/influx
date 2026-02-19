import { App, TFile, CachedMetadata, LinkCache, MarkdownRenderer, Component, FrontmatterLinkCache } from 'obsidian';
import { InlinkingFile } from './InlinkingFile';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from './types';
import ObsidianInflux from './main';
import { logger } from './utils/logger';
import {
    processFrontmatterLinks,
    shouldIncludeFrontmatterLinks,
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

export type BacklinksObject = { data: Map<string, LinkCache[]> | { [key: string]: LinkCache[] } }
export type ExtendedInlinkingFile = {
    inlinkingFile: InlinkingFile;
    titleInnerHTML: string;
    inner: HTMLDivElement;
}

export class ApiAdapter extends Component {
    app: App;
    private plugin: ObsidianInflux;
    // File operation caching to reduce I/O overhead
    private fileCache: Map<string, TFile> = new Map();
    private backlinksCache: Map<string, BacklinksObject> = new Map();
    private settingsCache: ObsidianInfluxSettings | null = null;
    // Cache compiled regex patterns to avoid recompilation on every pattern match
    // Use null as a sentinel value for invalid regex patterns
    private regexCache: Map<string, RegExp | null> = new Map();
    // Sentinel value to mark invalid regex patterns
    private static readonly INVALID_REGEX_SENTINEL: RegExp | null = null;

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
        if (this.fileCache.has(path)) {
            return this.fileCache.get(path)!;
        }

        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            this.fileCache.set(path, file);
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
        // Check cache first to reduce I/O
        const cacheKey = file.path;
        if (this.backlinksCache.has(cacheKey)) {
            return this.backlinksCache.get(cacheKey)!;
        }

        // Get settings early to check frontmatter link preference
        const settings = this.getSettings();

        logger.debug('getBacklinks called', {
            filePath: file.path,
            basename: file.basename,
            includeFrontmatterLinks: settings.includeFrontmatterLinks
        });

        // Runtime check for getBacklinksForFile availability
        let backlinks: BacklinksObject;
        const metadataCache = this.app.metadataCache as any;

        if (typeof metadataCache?.getBacklinksForFile === 'function') {
            backlinks = metadataCache.getBacklinksForFile(file);
            
            // Log what we got back from Obsidian
            logger.debug('Obsidian getBacklinksForFile result', {
                filePath: file.path,
                backlinksType: backlinks?.data instanceof Map ? 'Map' : 'Object',
                entryCount: backlinks?.data instanceof Map ? backlinks.data.size : Object.keys(backlinks?.data || {}).length,
                sampleEntries: backlinks?.data ? (
                    backlinks.data instanceof Map 
                        ? Array.from(backlinks.data.entries()).slice(0, 2).map(([path, links]) => ({
                            path,
                            linkCount: links.length,
                            linkPositions: links.map(l => ({ link: l.link, line: l.position?.start?.line }))
                        }))
                        : Object.entries(backlinks.data).slice(0, 2).map(([path, links]) => ({
                            path,
                            linkCount: links.length,
                            linkPositions: links.map(l => ({ link: l.link, line: l.position?.start?.line }))
                        }))
                ) : 'no data'
            });
        } else {
            logger.warn('getBacklinksForFile not available, returning empty backlinks');
            backlinks = { data: new Map() };
        }

        // Filter out frontmatter links if disabled
        if (!settings.includeFrontmatterLinks) {
            logger.debug('=== FRONTMATTER LINKS DISABLED - About to filter ===', { filePath: file.path });
            filterFrontmatterLinksFromBacklinks(
                backlinks,
                file.basename,
                (path: string) => this.getMetadata(this.getFileByPath(path)!)
            );
            
            // Log result after filtering
            logger.debug('=== AFTER FILTERING ===', {
                filePath: file.path,
                entryCount: backlinks?.data instanceof Map ? backlinks.data.size : Object.keys(backlinks?.data || {}).length
            });
        }

        const metadata = this.app.metadataCache.getFileCache(file);

        // Process front matter links using the pure function pipeline (only if enabled)
        if (metadata?.frontmatterLinks && Array.isArray(metadata.frontmatterLinks) && settings.includeFrontmatterLinks) {
            logger.debug('Processing frontmatter links', { 
                count: metadata.frontmatterLinks.length,
                filePath: file.path 
            });
            processFrontmatterLinks(backlinks, metadata.frontmatterLinks, settings);
        }

        this.backlinksCache.set(cacheKey, backlinks);
        return backlinks;
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
        if (this.settingsCache) {
            logger.debug('Returning cached settings', { sortingPrinciple: this.settingsCache.sortingPrinciple });
            return this.settingsCache;
        }

        logger.debug('Cache miss, loading settings');
        // Access settings directly from plugin instance
        let settings: ObsidianInfluxSettings;
        if (this.plugin?.data?.settings) {
            settings = { ...DEFAULT_SETTINGS, ...this.plugin.data.settings };
        } else {
            logger.warn('Plugin settings not found, using defaults');
            settings = DEFAULT_SETTINGS;
        }

        this.settingsCache = settings;
        // Pre-compile all regex patterns to eliminate JIT overhead on critical path
        this.preCompileRegexPatterns(this.settingsCache);
        return this.settingsCache;
    }
    /** Clear all caches - call when settings change or files are modified */
    clearCache(): void {
        this.fileCache.clear();
        this.backlinksCache.clear();
        this.settingsCache = null;
        this.regexCache.clear();
    }
    /** Invalidate settings cache - call when settings are changed via UI */
    invalidateSettingsCache(): void {
        this.settingsCache = null;
        this.regexCache.clear(); // Clear regex cache so new patterns are compiled
        this.backlinksCache.clear(); // Clear backlinks cache as frontmatter processing depends on settings
    }
    /** Invalidate cache for a specific file - call when file is modified/renamed/deleted */
    invalidateFileCache(path: string): void {
        this.fileCache.delete(path);
        this.backlinksCache.delete(path);
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
                    logger.error('Invalid regex pattern: ' + pattern, { pattern, error: err });
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
                logger.error('Invalid regex pattern: ' + pattern, { pattern, error: err });
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
        logger.debug('Creating comparison function', {
            attribute: settings.sortingAttribute,
            principle: settings.sortingPrinciple
        });
        // Use extracted pure function for file comparison
        return createInlinkingFileComparator(settings) as (a: InlinkingFile, b: InlinkingFile) => 0 | 1 | -1;
    }
    async renderAllMarkdownBlocks(inlinkingsFiles: InlinkingFile[]): Promise<ExtendedInlinkingFile[]> {
        const settings: Partial<ObsidianInfluxSettings> = this.getSettings()
        const comparator = this.makeComparisonFn()
        const components = await Promise.all(inlinkingsFiles
            .sort(comparator)
            .slice(0, settings.listLimit || inlinkingsFiles.length)
            .map(async (inlinkingFile) => {
                // Parallelize the two renderMarkdown calls to avoid sequential blocking
                const [titleAsMd, summaryAsMd] = await Promise.all([
                    this.renderMarkdown(`_${inlinkingFile.title}`),
                    this.renderMarkdown(inlinkingFile.summary),
                ])

                // Optimize string processing: remove p and heading tags, then clean up any remaining underscores
                const titleInnerHTML = titleAsMd.innerHTML
                    .replace(/<\/?p[^>]*>/gi, '')      // Remove <p>, </p> tags
                    .replace(/<\/?h[1-6][^>]*>/gi, '')   // Remove <h1-h6>, </h1-h6> tags
                    .replace(/(\r\n|\n|\r)+/g, ' ')    // Replace newlines from outline-style headings with space
                    .replace(/^_/, '')            // Remove leading underscore (now at start after tag removal)
                    .trim()                    // Remove leading/trailing whitespace

                logger.debug('Processed title HTML', {
                    original: titleAsMd.innerHTML,
                    cleaned: titleInnerHTML
                });

 
                // Also clean summary HTML to remove unwanted p and heading tags
                summaryAsMd.innerHTML = summaryAsMd.innerHTML
                    .replace(/<\/?p[^>]*>/gi, '')      // Remove <p>, </p> tags
                    .replace(/<\/?h[1-6][^>]*>/gi, '')   // Remove <h1-h6>, </h1-h6> tags
                    .replace(/(\r\n|\n|\r)+/g, ' ')    // Replace newlines from outline-style headings with space
                    .replace(/\n(Heading \d+|H\d+)\n/g, '\n<li class="has-bare-heading">$1</li>\n')  // Mark bare heading list items with class
                    .replace(/\n<(?:p|h[1-6])/gi, '<$1')  // Remove newlines before <p> and <h1-h6> tags
                    .replace(/(?:<\/(?:p|h[1-6])>\n)/gi, '$1>')  // Remove newlines after </p> and </h1-h6> tags
                    .replace(/(>)(\n+)(<)/gi, '$1$3')  // Remove newlines between tags
                    .trim()                    // Remove leading/trailing whitespace

                logger.debug('Processed summary HTML', {
                    original: summaryAsMd.innerHTML,
                    cleaned: summaryAsMd.innerHTML
                });


                const extended: ExtendedInlinkingFile = {
                    inlinkingFile: inlinkingFile,
                    titleInnerHTML: titleInnerHTML,
                    inner: summaryAsMd,
                }
                return extended
            }))
        return components
    }
    /** comparison fn for filter in function to make contextual summaries,
     * to find relevant links.
     * Delegates to the pure function in settings-utils.
     */
    compareLinkName(link: LinkCache, basename: string): boolean {
        return compareLinkName(link, basename);
    }
}

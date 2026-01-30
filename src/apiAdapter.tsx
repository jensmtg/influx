import { App, TFile, CachedMetadata, LinkCache, MarkdownRenderer, Component, FrontmatterLinkCache } from 'obsidian';
import { InlinkingFile } from './InlinkingFile';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from './main';
import ObsidianInflux from './main';
import { 
    processFrontmatterLinks,
    shouldIncludeFrontmatterLinks
} from './frontmatter-utils';

export type BacklinksObject = { data: Map<string, LinkCache[]> | { [key: string]: LinkCache[] } }
export type ExtendedInlinkingFile = {
    inlinkingFile: InlinkingFile;
    titleInnerHTML: string;
    inner: HTMLDivElement;
}

export class ApiAdapter extends Component {
    app: App;
    // File operation caching to reduce I/O overhead
    private fileCache: Map<string, TFile> = new Map();
    private backlinksCache: Map<string, BacklinksObject> = new Map();
    private settingsCache: ObsidianInfluxSettings | null = null;
    // Cache compiled regex patterns to avoid recompilation on every pattern match
    // Use null as a sentinel value for invalid regex patterns
    private regexCache: Map<string, RegExp | null> = new Map();
    // Sentinel value to mark invalid regex patterns
    private static readonly INVALID_REGEX_SENTINEL: RegExp | null = null;

    constructor(app: App) {
        super();
        this.app = app;
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

        // @ts-expect-error - getBacklinksForFile is not officially typed in MetadataCache
        const backlinks = this.app.metadataCache.getBacklinksForFile(file);
        const metadata = this.app.metadataCache.getFileCache(file);
        
        // Process front matter links using the pure function pipeline
        if (metadata?.frontmatterLinks) {
            const settings = this.getSettings();
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
        const settings: Partial<ObsidianInfluxSettings> = this.getSettings()
        const patterns = settings.showBehaviour === 'OPT_IN' ? settings.inclusionPattern : settings.exclusionPattern
        const matched = this.patternMatchingFn(file.path, patterns)
        const show = settings.showBehaviour === 'OPT_IN' && matched ? true
            : settings.showBehaviour === 'OPT_OUT' && !matched ? true
                : false
        return show
    }
    isIncludableSource(path: string): boolean {
        const settings: Partial<ObsidianInfluxSettings> = this.getSettings()
        const patterns = settings.sourceBehaviour === 'OPT_IN' ? settings.sourceInclusionPattern : settings.sourceExclusionPattern
        const matched = this.patternMatchingFn(path, patterns)
        const isIncludable = settings.sourceBehaviour === 'OPT_IN' && matched ? true
            : settings.sourceBehaviour === 'OPT_OUT' && !matched ? true
                : false
        return isIncludable
    }
    /** For a given file, should Influx component be shown as collapsed on it's page? */
    getCollapsedStatus(file: TFile): boolean {
        const settings: Partial<ObsidianInfluxSettings> = this.getSettings()
        const matched = this.patternMatchingFn(file.path, settings.collapsedPattern)
        return matched
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
        const settings: Partial<ObsidianInfluxSettings> = this.getSettings()

        const flip = settings.sortingPrinciple === 'OLDEST_FIRST'

        if (settings.sortingAttribute === 'FILENAME') {
            return function compareDatesFn(a: InlinkingFile, b: InlinkingFile) {
                if (a.file.basename < b.file.basename) return flip ? -1 : 1
                else if (a.file.basename > b.file.basename) return flip ? 1 : -1
                else return 0
            }
        }

        else {

            const sortingAttr = settings.sortingAttribute === 'ctime' || settings.sortingAttribute === 'mtime' ? settings.sortingAttribute : 'ctime'

            return function compareDatesFn(a: InlinkingFile, b: InlinkingFile) {
                if (a.file.stat[sortingAttr] < b.file.stat[sortingAttr]) return flip ? -1 : 1
                else if (a.file.stat[sortingAttr] > b.file.stat[sortingAttr]) return flip ? 1 : -1
                else return 0
            }

        }
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

                // Optimize string processing: remove p tags, then clean up any remaining underscores
                const titleInnerHTML = titleAsMd.innerHTML
                    .replace(/<\/?p[^>]*>/g, '')  // Remove <p>, </p> tags
                    .replace(/^_/, '')            // Remove leading underscore (now at start after p tag removal)

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
     */
    compareLinkName(link: LinkCache, basename: string) {
        // format link name to be comparable with base names:
        const path = link.link;
        // grab only the filename from a multi-folder path
        const filenameOnly = path.split("/").slice(-1)[0]

        // strip any block and heading references from the end and the ".md" extension
        const linkname = filenameOnly.split(/[#^]/)[0].split(".md")[0]

        return linkname.toLowerCase() === basename.toLowerCase()
    }
}

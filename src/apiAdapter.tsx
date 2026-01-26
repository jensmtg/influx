import { App, TFile, CachedMetadata, LinkCache, MarkdownRenderer, Component } from 'obsidian';
import { InlinkingFile } from './InlinkingFile';
import { DEFAULT_SETTINGS, ObsidianInfluxSettings } from './main';
import ObsidianInflux from './main';

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
        this.backlinksCache.set(cacheKey, backlinks);
        return backlinks;
    }
    async renderMarkdown(markdown: string): Promise<HTMLDivElement> {
        const div = document.createElement('div');
        await MarkdownRenderer.renderMarkdown(markdown, div, '/', this);

        // Disable checkboxes in preview mode to prevent interaction
        // Replace type="checkbox" with type="checkbox" disabled="true"
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = div.innerHTML.replace(/type="checkbox"/g, 'type="checkbox" disabled="true"');
        div.innerHTML = tempDiv.innerHTML;
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
        return this.settingsCache;
    }
    /** Clear all caches - call when settings change or files are modified */
    clearCache(): void {
        this.fileCache.clear();
        this.backlinksCache.clear();
        this.settingsCache = null;
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
                return new RegExp(pattern).test(path);
            } catch (err) {
                console.error('Recent Files: Invalid regex pattern: ' + pattern);
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
                const titleAsMd = await this.renderMarkdown(`_${inlinkingFile.title}`)
                // Remove the <p dir="auto"> tag and </p> properly
                const titleInnerHTML = titleAsMd.innerHTML
                    .replace(/<p[^>]*>/g, '')  // Remove opening p tag with any attributes
                    .replace(/<\/p>/g, '')     // Remove closing p tag
                    .replace(/^_/, '')         // Remove leading underscore we added

                const extended: ExtendedInlinkingFile = {
                    inlinkingFile: inlinkingFile,
                    titleInnerHTML: titleInnerHTML,
                    inner: await this.renderMarkdown(inlinkingFile.summary),
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
} // Add this closing brace

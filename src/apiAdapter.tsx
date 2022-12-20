import { App, TFile, CachedMetadata, LinkCache, MarkdownRenderer } from 'obsidian';
import { InlinkingFile } from './InlinkingFile';
import { ObsidianInfluxSettings } from './main';

export type BacklinksObject = { data: { [key: string]: LinkCache[] } }
export type ExtendedInlinkingFile = {
    inlinkingFile: InlinkingFile;
    titleInnerHTML: string;
    inner: HTMLDivElement[];
}

export class ApiAdapter {
    app: App;

    constructor(app: App) {
        this.app = app
    }


    /** =================
     * OBSIDIAN resources 
     * ==================
     */


    getFileByPath(path: string): TFile {
        const file = this.app.vault.getAbstractFileByPath(path)
        if (file instanceof TFile) {
            return file
        }
    }


    async readFile(file: TFile): Promise<string> {
        return await this.app.vault.read(file)
    }


    getMetadata(file: TFile): CachedMetadata {
        return this.app.metadataCache.getFileCache(file);
    }


    getBacklinks(file: TFile): BacklinksObject {
        // getBacklinksForFile is not document officially, so it might break at some point.
        // @ts-ignore
        return this.app.metadataCache.getBacklinksForFile(file)
    }


    async renderMarkdown(markdown: string): Promise<HTMLDivElement> {
        const div = document.createElement('div');
        await MarkdownRenderer.renderMarkdown(markdown, div, '/', null)
        // @ts-ignore
        div.innerHTML = div.innerHTML.replaceAll('type="checkbox"', 'type="checkbox" disabled="true"')
        return div
    }


    getSettings() {
        // @ts-ignore
        const settings = this.app.plugins?.plugins?.influx?.data?.settings || {}
        return settings
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

                // Parse title, and strip innerHTML of enclosing <p>:
                // Also pad with underscore and slice away, to avoid parsing "2022." as ordered list. 
                const titleAsMd = await this.renderMarkdown(`_${inlinkingFile.title}`)
                const titleInnerHTML = titleAsMd.innerHTML.slice(4, -4)

                const extended: ExtendedInlinkingFile = {
                    inlinkingFile: inlinkingFile,
                    titleInnerHTML: titleInnerHTML,
                    inner: await Promise.all(inlinkingFile.contextSummaries.map(async (summary) => await this.renderMarkdown(summary))),
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

        // strip any block references from the end and the ".md" extension
        const linkname = filenameOnly.split("#^")[0].split(".md")[0]

        if (linkname.toLowerCase() === basename.toLowerCase()) {
            return true
        }
        return false
    }



}
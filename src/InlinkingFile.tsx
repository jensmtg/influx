import { TFile, CachedMetadata } from 'obsidian';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';
import { StructuredText } from './StructuredText';
import { CONSTANTS } from './constants';
import { cacheManager } from './state/CacheManager';


export class InlinkingFile {
    api: ApiAdapter;
    file: TFile;
    meta: CachedMetadata;
    content: string;
    title: string;
    titleLineNum: number | undefined;
    contextFile: InfluxFile;
    isLinkInTitle: boolean;
    summary: string;

    constructor(file: TFile, apiAdapter: ApiAdapter) {
        this.api = apiAdapter
        this.file = file
        this.meta = this.api.getMetadata(this.file)
        this.content = ''
        this.title = ''
        this.titleLineNum = undefined
        this.isLinkInTitle = false
        this.summary = ''
    }

    public async makeSummary(contextFile: InfluxFile, settingsHash: string) {
        this.contextFile = contextFile
        const targetPath = contextFile.file?.path
        const sourcePath = this.file?.path
        const sourceMtime = this.file?.stat?.mtime ?? 0

        if (sourcePath && targetPath) {
            const cachedSummary = cacheManager.getSummary(sourcePath, sourceMtime, targetPath, settingsHash)
            if (cachedSummary) {
                this.title = cachedSummary.title
                this.titleLineNum = cachedSummary.titleLineNum
                this.isLinkInTitle = cachedSummary.isLinkInTitle
                this.summary = cachedSummary.summary
                return
            }
        }

        if (!this.meta) {
            this.summary = ''
            return
        }

        this.content = await this.api.readFile(this.file)

        const struct = new StructuredText(this.content)
        // Extract only links that reference the context file
        const links = this.meta.links
            ? this.meta.links.filter(link => this.api.compareLinkName(link, contextFile.file.basename))
            : []
        const lineNumbersOfLinks = links
            .filter(link => link.position && link.position.start)
            .map(link => link.position.start.line)

        this.setTitle()
        this.isLinkInTitle = this.titleLineNum !== undefined && lineNumbersOfLinks.includes(this.titleLineNum)

        // If link is in title, show entire content; otherwise show only relevant branches
        if (this.isLinkInTitle) {
            this.summary = struct.stringify()
        }
        else {
            this.summary = struct.stringifyBranchesOfNodesWithLinks(lineNumbersOfLinks)
        }

        if (sourcePath && targetPath) {
            cacheManager.setSummary(sourcePath, sourceMtime, targetPath, settingsHash, {
                summary: this.summary,
                title: this.title,
                titleLineNum: this.titleLineNum,
                isLinkInTitle: this.isLinkInTitle,
            })
        }

    }

    setTitle() {
        // Priority: frontmatter attribute > first heading > empty string
        const titleByFrontmatterAttribute = this.meta && this.meta.frontmatter && CONSTANTS.FRONTMATTER_KEY in this.meta.frontmatter ? this.meta.frontmatter[CONSTANTS.FRONTMATTER_KEY] : null
        const titleByFirstHeader = this.meta.headings?.[0]
        this.title = titleByFrontmatterAttribute || titleByFirstHeader?.heading || ''
        this.titleLineNum = titleByFirstHeader?.position?.start.line ?? undefined;
    }

}


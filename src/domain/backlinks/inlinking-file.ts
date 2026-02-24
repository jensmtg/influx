import { TFile, CachedMetadata, normalizePath } from 'obsidian';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';
import { StructuredText } from './domain/structured-text/structured-text';
import { CONSTANTS } from './constants';
import { cacheManager, SummaryCacheValue } from './platform/cache/CacheManager';


export class InlinkingFile {
    private static inflightSummaries = new Map<string, Promise<SummaryCacheValue>>();

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
                this.applySummary(cachedSummary)
                return
            }

            const cacheKey = this.makeInflightSummaryKey(sourcePath, sourceMtime, targetPath, settingsHash)
            const inflightSummary = InlinkingFile.inflightSummaries.get(cacheKey)
            if (inflightSummary) {
                this.applySummary(await inflightSummary)
                return
            }

            const buildPromise = this.buildSummaryValue(contextFile)
            InlinkingFile.inflightSummaries.set(cacheKey, buildPromise)

            try {
                const summaryValue = await buildPromise
                cacheManager.setSummary(sourcePath, sourceMtime, targetPath, settingsHash, summaryValue)
                this.applySummary(summaryValue)
                return
            } finally {
                InlinkingFile.inflightSummaries.delete(cacheKey)
            }
        }

        this.applySummary(await this.buildSummaryValue(contextFile))
    }

    setTitle() {
        // Priority: frontmatter attribute > first heading > empty string
        const titleByFrontmatterAttribute = this.meta && this.meta.frontmatter && CONSTANTS.FRONTMATTER_KEY in this.meta.frontmatter ? this.meta.frontmatter[CONSTANTS.FRONTMATTER_KEY] : null
        const titleByFirstHeader = this.meta.headings?.[0]
        this.title = titleByFrontmatterAttribute || titleByFirstHeader?.heading || ''
        this.titleLineNum = titleByFirstHeader?.position?.start.line ?? undefined;
    }

    private makeInflightSummaryKey(sourcePath: string, sourceMtime: number, targetPath: string, settingsHash: string): string {
        return `${normalizePath(sourcePath).toLowerCase()}|${sourceMtime}|${normalizePath(targetPath).toLowerCase()}|${settingsHash}`
    }

    private applySummary(summaryValue: SummaryCacheValue): void {
        this.summary = summaryValue.summary
        this.title = summaryValue.title
        this.titleLineNum = summaryValue.titleLineNum
        this.isLinkInTitle = summaryValue.isLinkInTitle
    }

    private async buildSummaryValue(contextFile: InfluxFile): Promise<SummaryCacheValue> {
        if (!this.meta) {
            return {
                summary: '',
                title: '',
                titleLineNum: undefined,
                isLinkInTitle: false,
            }
        }

        this.content = await this.api.readFile(this.file)
        const struct = new StructuredText(this.content)
        const links = this.meta.links
            ? this.meta.links.filter(link => this.api.compareLinkName(link, contextFile.file.basename))
            : []
        const lineNumbersOfLinks = links
            .filter(link => link.position && link.position.start)
            .map(link => link.position.start.line)

        this.setTitle()
        const isLinkInTitle = this.titleLineNum !== undefined && lineNumbersOfLinks.includes(this.titleLineNum)
        const summary = isLinkInTitle
            ? struct.stringify()
            : struct.stringifyBranchesOfNodesWithLinks(lineNumbersOfLinks)

        return {
            summary,
            title: this.title,
            titleLineNum: this.titleLineNum,
            isLinkInTitle,
        }
    }
}


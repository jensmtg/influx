import { TFile, CachedMetadata } from 'obsidian';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';
import { StructuredText } from './StructuredText';

const FRONTMATTER_KEY = 'influx-title' // Unexposed feature to show frontmatter value as title for clipping.


export class InlinkingFile {
    api: ApiAdapter;
    file: TFile;
    meta: CachedMetadata;
    content: string;
    title: string;
    titleLineNum: number;
    nodeLookup: { [key: string]: number[] }; // find node by lineNum
    contextFile: InfluxFile;
    contextSummaries: string[]
    isLinkInTitle: boolean;
    summary: string;

    constructor(file: TFile, apiAdapter: ApiAdapter) {
        this.api = apiAdapter
        this.file = file
        this.meta = this.api.getMetadata(this.file)
    }

    public async makeSummary(contextFile: InfluxFile) {

        this.contextFile = contextFile
        this.content = await this.api.readFile(this.file)

        const struct = new StructuredText(this.content)
        const links = (this.meta && this.meta.links)
            ? this.meta.links.filter(link => this.api.compareLinkName(link, contextFile.file.basename))
            : []
        const lineNumbersOfLinks = links
            .filter(link => link.position && link.position.start)
            .map(link => link.position.start.line)

        this.setTitle()
        this.isLinkInTitle = this.titleLineNum !== undefined && lineNumbersOfLinks.includes(this.titleLineNum)

        if (this.isLinkInTitle) {
            this.summary = struct.stringify()
        }
        else {
            this.summary = struct.stringifyBranchesOfNodesWithLinks(lineNumbersOfLinks)
            // console.log('this.summary', this.summary)
        }

    }

    setTitle() {
        const titleByFrontmatterAttribute = this.meta && this.meta.frontmatter && FRONTMATTER_KEY in this.meta.frontmatter ? this.meta.frontmatter[FRONTMATTER_KEY] : null
        const titleByFirstHeader = this.meta.headings?.[0]
        this.title = titleByFrontmatterAttribute || titleByFirstHeader?.heading || ''
        if (titleByFirstHeader && titleByFirstHeader.position) {
            this.titleLineNum = titleByFirstHeader.position.start.line
        }
    }

}


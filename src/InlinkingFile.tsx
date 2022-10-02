import { TFile, CachedMetadata } from 'obsidian';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';
import { TreeNode, makeLineItemsFromIndentedText, makeNodeTreefromLineItems, nodeToMarkdownSummary, recursivelyBuildLookup, treeToMarkdownSummary } from './treeUtils';

const FRONTMATTER_KEY = 'influx-title' // Unexposed feature to show frontmatter value as title for clipping.


export class InlinkingFile {
    api: ApiAdapter;
    file: TFile;
    meta: CachedMetadata;
    content: string;
    title: string;
    titleLineNum: number;
    nodeTree: TreeNode[];
    nodeLookup: { [key: string]: number[] }; // find node by lineNum
    contextFile: InfluxFile;
    contextSummaries: string[]
    isLinkInTitle: boolean;

    constructor(file: TFile, apiAdapter: ApiAdapter) {
        this.api = apiAdapter
        this.file = file
        this.meta = this.api.getMetadata(this.file)
    }

    async makeContextualSummaries(contextFile: InfluxFile) {
        this.setTitle()
        this.content = await this.api.readFile(this.file)
        this.nodeTree = makeNodeTreefromLineItems(makeLineItemsFromIndentedText(this.content))
        this.nodeLookup = recursivelyBuildLookup(this.nodeTree)
        this.contextFile = contextFile
        const links = this.meta.links.filter(link => this.api.compareLinkName(link, contextFile.file.basename))
        const linksAtLineNums = links.map(link => link.position.start.line)

        this.isLinkInTitle = this.titleLineNum !== undefined && linksAtLineNums.includes(this.titleLineNum)

        if (this.isLinkInTitle) {
            this.contextSummaries = [treeToMarkdownSummary(this.nodeTree)]
        }
        else {
            this.contextSummaries = links.map(link => nodeToMarkdownSummary(link.position.start.line, this.nodeLookup, this.nodeTree))
        }

    }

    setTitle() {
        const titleByFrontmatterAttribute = this.meta && this.meta.frontmatter && FRONTMATTER_KEY in this.meta.frontmatter ? this.meta.frontmatter[FRONTMATTER_KEY] : null
        const titleByFirstHeader = this.meta.headings?.[0]
        this.title = titleByFrontmatterAttribute || titleByFirstHeader?.heading || ''
        if (titleByFirstHeader) {
            this.titleLineNum = titleByFirstHeader.position.start.line
        }
    }

}


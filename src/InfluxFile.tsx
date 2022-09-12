import { TFile, CachedMetadata } from 'obsidian';
import { ApiAdapter, BacklinksObject } from './apiAdapter';
import { ObsidianInfluxSettings } from './main';

const SHOW_ANCESTORS = true
const FRONTMATTER_KEY = 'influx-title' // Unexposed feature to show frontmatter value as title for clipping.

type TreeNode = {
    text: string;
    indent: number;
    plain: string;
    children?: TreeNode[];
    lineNum?: number;
}

export type ExtendedInlinkingFile = {
    inlinkingFile: InlinkingFile;
    titleInnerHTML: string;
    inner: HTMLDivElement[];
}

export default class InfluxFile {
    api: ApiAdapter;
    file: TFile;
    meta: CachedMetadata;
    backlinks: BacklinksObject;
    inlinkingFiles: InlinkingFile[];
    components: ExtendedInlinkingFile[];


    constructor(path: string, apiAdapter: ApiAdapter) {
        this.api = apiAdapter

        this.file = this.api.getFileByPath(path)
        this.meta = this.api.getMetadata(this.file)
        this.backlinks = this.api.getBacklinks(this.file)
        this.inlinkingFiles = []
        this.components = []

    }

    async makeInfluxList() {
        const backlinksAsFiles = Object.keys(this.backlinks.data).map((pathAsKey) => this.api.getFileByPath(pathAsKey))
        await Promise.all(backlinksAsFiles.map(async (file: TFile) => {
            const inlinkingFile = new InlinkingFile(file, this.api)
            await inlinkingFile.makeContextualSummaries(this)
            this.inlinkingFiles.push(inlinkingFile)
        }))
    }

    async renderAllMarkdownBlocks() {

        const settings: Partial<ObsidianInfluxSettings> = this.api.getSettings()

        const comparator = this.makeComparisonFn(settings)
        this.components = await Promise.all(this.inlinkingFiles
            .sort(comparator)
            .slice(0, settings.listLimit || this.inlinkingFiles.length)
            .map(async (inlinkingFile) => {

                // Parse title, and strip innerHTML of enclosing <p>:
                const titleAsMd = await this.api.renderMarkdown(inlinkingFile.title)
                const titleInnerHTML = titleAsMd.innerHTML.slice(3, -4)

                const extended: ExtendedInlinkingFile = {
                    inlinkingFile: inlinkingFile,
                    titleInnerHTML: titleInnerHTML,
                    inner: await Promise.all(inlinkingFile.contextSummaries.map(async (summary) => await this.api.renderMarkdown(summary))),
                }

                return extended
            }))
    }

    /** A sort function to order notes correctly, based on settings. */
    makeComparisonFn(settings: Partial<ObsidianInfluxSettings> ) {

        const sortingAttr = settings.sortingAttribute === 'ctime' || settings.sortingAttribute === 'mtime' ? settings.sortingAttribute : 'ctime'
        const flip = settings.sortingPrinciple === 'OLDEST_FIRST'

        return function compareDatesFn(a: InlinkingFile, b: InlinkingFile) {
            if (a.file.stat[sortingAttr] < b.file.stat[sortingAttr]) return flip ? -1 : 1
            else if (a.file.stat[sortingAttr] > b.file.stat[sortingAttr]) return flip ? 1 : -1
            else return 0
        }
    }

}


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
        const links = this.meta.links.filter(link => link.link === contextFile.file.basename)
        const linksAtLineNums = links.map(link => link.position.start.line)

        if (this.titleLineNum !== undefined && linksAtLineNums.includes(this.titleLineNum)) {
            this.contextSummaries = [this.treeToMarkdownSummary()]
        }
        else {
            this.contextSummaries = links.map(link => this.nodeToMarkdownSummary(link.position.start.line))
        }

    }

    setTitle() {
        const titleByFrontmatterAttribute = this.meta.frontmatter?.[FRONTMATTER_KEY]
        const titleByFirstHeader = this.meta.headings?.[0]
        this.title = titleByFrontmatterAttribute || titleByFirstHeader?.heading || ''
        if (titleByFirstHeader) {
            this.titleLineNum = titleByFirstHeader.position.start.line
        }
    }

    nodeToMarkdownSummary(lineNum: number) {
        const lookup = this.nodeLookup[lineNum]

        let output = ''

        const traverse = (node: TreeNode, level: number, _lookup: number[]) => {

            const lookup = _lookup.slice(1)

            if (lookup.length) {
                if (SHOW_ANCESTORS) {
                    const expectedBullet = node.plain.substring(0, 2)
                    const nodeString = expectedBullet === '* '
                        ? `* <span class="ancestor">${node.plain.slice(2)}</span>`
                        : node.plain
                    output = output + `${' '.repeat(2 * level)}${nodeString}\n`
                }
                traverse(node.children[lookup[0]], level + 1, lookup)
            }
            else {
                output = output + `${' '.repeat(2 * level)}${node.plain}\n`
                node.children.forEach(node => { traverse(node, level + 1, lookup) })
            }

        }

        traverse(this.nodeTree[lookup[0]], 0, lookup)

        return output

    }

    treeToMarkdownSummary() {

        let output = ''

        const traverse = (node: TreeNode, level: number) => {
            output = output + `${' '.repeat(2 * level)}${node.plain}\n`
            node.children.forEach(node => { traverse(node, level + 1) })
        }

        this.nodeTree.forEach((node: TreeNode) => {
            traverse(node, 0)
        })

        return output
    }


}


export const makeLineItemsFromIndentedText = (text: string) => {


    const lines: TreeNode[] = text.split('\n').map((line, i) => {
        return {
            text: line,
            indent: line.search(/\S/),  // String search (returns index of first match) for first any non-whitespace character in the line
            plain: line.trim(),
        }
    })

    return lines

}


export const makeNodeTreefromLineItems = (lines: TreeNode[]) => {

    const branches = []
    const carry: { [key: string]: TreeNode[] } = {}


    for (let i = lines.length - 1; i > -1; i--) {


        const line: TreeNode = { ...lines[i], children: [], lineNum: i }
        const indentsInCarry = Object.keys(carry)
        const childIndents = indentsInCarry.filter(j => Number(j) > line.indent)


        // If empty line, place any carried lines on root and end current iteration.
        // (Indented lines without overhanging lines.)
        if (line.indent === -1) {
            if (childIndents.length) {
                childIndents.forEach(childIndent => {
                    carry[childIndent].map((_elem: any) => branches.push(_elem))
                    delete carry[childIndent]
                })
            }
            continue
        }


        // Add underhanging carried items to current lines' children
        if (childIndents.length) {
            childIndents.forEach(childIndent => {
                line.children = [...line.children, ...carry[childIndent]]
                delete carry[childIndent]
            })
        }


        // Only carry lines with potentially overhanging lines
        if (line.indent > 0 && i > 0) {
            const indent = carry[line.indent] || []
            indent.unshift(line)
            carry[line.indent] = indent
        }


        // Otherwise place on root
        else {
            branches.unshift(line)
        }


    }

    return branches
}


export const recursivelyBuildLookup = (nodeTree: TreeNode[]) => {

    const nodeLookup: { [key: string]: number[] } = {}

    const traverse = (node: TreeNode, adr: number[]) => {
        nodeLookup[node.lineNum] = adr
        node.children.forEach((_node, _i) => traverse(_node, [...adr, _i]))
    }

    nodeTree.forEach((node, i) => { traverse(node, [i]) })

    return nodeLookup

}


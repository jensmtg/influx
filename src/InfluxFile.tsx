import { TFile, CachedMetadata, LinkCache } from 'obsidian';
import { ApiAdapter, BacklinksObject } from './apiAdapter';

const SHOW_ANCESTORS = true
const FRONTMATTER_KEY = 'tittel'

export default class InfluxFile {
    api: ApiAdapter;
    file: TFile;
    meta: CachedMetadata;
    backlinks: BacklinksObject;


    constructor(path: string, apiAdapter: ApiAdapter) {
        this.api = apiAdapter

        this.file = this.api.getFileByPath(path)
        this.meta = this.api.getMetadata(this.file)
        this.backlinks = this.api.getBacklinks(this.file)


    }

    async makeInfluxList() {
        const backlinksAsFiles = Object.keys(this.backlinks.data).map((pathAsKey) => this.api.getFileByPath(pathAsKey))
        await Promise.all(backlinksAsFiles.map(async (file: TFile) => {
            // console.log('we have:!!', this.file, file)
            const inlinkingFile = new InlinkingFile(file, this.api)
            await inlinkingFile.makeContextualSummary()

            // const content = await this.api.readFile(file)

        }))
    }

}


export class InlinkingFile {
    api: ApiAdapter;
    file: TFile;
    meta: CachedMetadata;
    content: string;
    title: string;
    nodeTree: any;

    constructor(file: TFile, apiAdapter: ApiAdapter) {
        this.api = apiAdapter
        this.file = file
        this.meta = this.api.getMetadata(this.file)
    }

    async makeContextualSummary() {
        this.content = await this.api.readFile(this.file)
        this.title = this.getTitle()
        const lines = makeLineItemsFromIndentedText(this.content)
        console.log('-- lines', lines)
        this.nodeTree = makeNodeTreefromLineItems(lines)
        console.log('-- nodeTree', this.nodeTree)
        // console.log('inlinking', this)
    }

    getTitle() {
        const titleByFrontmatterAttribute = this.meta.frontmatter?.[FRONTMATTER_KEY]
        const titleByFirstHeader = this.meta.headings?.[0]?.heading
        return titleByFrontmatterAttribute || titleByFirstHeader || ''
    }


}


export const makeLineItemsFromIndentedText = (text: string) => {


    const lines = text.split('\n').map((line, i) => {
        return {
            text: line,
            indent: line.search(/\S/),  // String search (returns index of first match) for first any non-whitespace character in the line
            plain: line.trim()
            // children: []
            // lineNum: i,
        }
    })

    return lines


}


export const makeNodeTreefromLineItems = (lines: any) => {

    const branches = []
    const carry: any = {}

    for (let i = lines.length - 1; i > -1; i--) {

        const line = { ...lines[i], children: [] }
        const indentsInCarry = Object.keys(carry)
        const childIndents = indentsInCarry.filter(_i => Number(_i) > line.indent)
    

        if (line.indent === -1) {
          if (childIndents.length) {
            childIndents.forEach(childIndent => {
              carry[childIndent].map(_elem => branches.push(_elem))
              delete carry[childIndent]
            })
          }
          continue
        }
    
        // console.log(`${line.n} - indent: ${line.indent}, indentsInCarry: ${indentsInCarry} childLvls: ${childIndents}
        // `)
    
        if (childIndents.length) {
          childIndents.forEach(childIndent => {
            line.children = [...line.children, carry[childIndent]]
            delete carry[childIndent]
          })
        }
    
        
        if (line.indent > 0 && i > 1) {
          const indent = carry[line.indent] || []
          indent.unshift(line)
          carry[line.indent] = indent
        }
    
        else {
          branches.unshift(line)
        }
    
      }

      return branches
}



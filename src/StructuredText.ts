import {
    lastNonEmptyElement,
    ifOrderedListItemReturnOrdinal,
    parseMarkdownTableRow,
    isProperBullet,
    calculateLeadingIndent,
    generateNodeId
} from './structuredtext-utils';

const FRONTMATTER_SIGN = '---'
const BULLET_SIGN = '* '
const DASH_SIGN = '- '
const QUOTE_SIGN = '>'
const CALLOUT_HEADER_SIGN = '[!'
const OUTPUT_INDENT_SPACES = 2
const OUTPUT_INDENT = ' '
const OUTPUT_INDENT_STEP = OUTPUT_INDENT.repeat(OUTPUT_INDENT_SPACES)
const OUTPUT_ORDINAL_SIGN = '. '
const OUTPUT_QUOTE = '> '
const OUTPUT_BULLET = '* '


export type NodeId = string;
export type ExplicitIncludes = boolean[]

export enum ModeType {
    List = 'LIST',
    CallOut = 'CALLOUT',
    Frontmatter = 'FRONTMATTER',
    Quote = 'QUOTE',
    Table = 'TABLE',
    Other = 'OTHER',
    None = 'NONE',
}

export enum NodeType {
    ListUnordered = 'LIST_UNORDERED',
    ListOrdered = 'LIST_ORDERED',
    CallOutHeader = 'CALLOUT_HEADER',
    TableHeader = 'TABLE_HEADER',
    TableDivider = 'TABLE_DIVIDER',
    TableRow = 'TABLE_ROW',
    Quote = 'QUOTE',
    Blank = 'BLANK',
    Other = 'OTHER',
}

export interface NodeInternal {
    raw: string;
    trimmed: string;
    type: NodeType;
    mode: ModeType;
    stripped: string;
    calloutLevel?: number;
    isQuotedBullet?: boolean;
    isFirstOfMode?: boolean;
    ordinal?: number;
    cols?: number;
    headerId?: string;
    debug: any;
}

export type InternalsIndex = { [key: NodeId]: NodeInternal }
export type ChildrenIndex = { [key: NodeId]: NodeId[] }
export type ParentsIndex = { [key: NodeId]: NodeId }
export type DescendantsIndex = { [key: NodeId]: NodeId[] }
export type AncestorsIndex = { [key: NodeId]: NodeId[] }
export type RootsIndex = { [key: NodeId]: any }

export type TypeIndex = { [key in NodeType]: NodeId[] }


export class StructuredText {

    raw: string;
    internals: InternalsIndex;
    children: ChildrenIndex;
    parents: ParentsIndex;
    types: TypeIndex;
    descendants: DescendantsIndex = {}
    ancestors: AncestorsIndex = {}
    roots: RootsIndex = {}


    constructor(raw: string) {
        const { internals, children, parents, roots } = this.parseText(raw)
        this.raw = raw
        this.internals = internals
        this.children = children
        this.parents = parents
        this.roots = roots

        this.buildAncestorsAndDescendantsIndexes()
    }

    private parseText(text: string): { internals: InternalsIndex, children: ChildrenIndex, parents: ParentsIndex, roots: RootsIndex } {

        const lines = text.split('\n');
        const internals: InternalsIndex = {}
        const children: ChildrenIndex = {}
        const parents: ParentsIndex = {}
        const roots: RootsIndex = {}
        const types: TypeIndex = {
            [NodeType.ListUnordered]: [],
            [NodeType.ListOrdered]: [],
            [NodeType.CallOutHeader]: [],
            [NodeType.Other]: [],
            [NodeType.TableHeader]: [],
            [NodeType.TableDivider]: [],
            [NodeType.TableRow]: [],
            [NodeType.Quote]: [],
            [NodeType.Blank]: [],
        }

        let stack: NodeId[] = []
        let mode: ModeType = ModeType.None
        let calloutLevel = 0
        let frontmatterDone = false


        for (let i = 0; i < lines.length; i++) {

            const line = lines[i]
            const leadingIndent = calculateLeadingIndent(line);
            const trimmed = line.slice(leadingIndent);
            const id: NodeId = generateNodeId(i)
            const isProperBulletVal = isProperBullet(trimmed)


            let stripped = ''
            let type: NodeType
            let indent = 0
            const debug: any = {}
            let isQuotedBullet: boolean;
            let isFirstOfMode: boolean;
            let ordinal: number;
            let tr: null | { cols: number, isDivider: boolean };
            let cols: number;
            let headerId: string


            if (i === 0 && line.substring(0, 3) === FRONTMATTER_SIGN) {
                mode = ModeType.Frontmatter
            }

            else if (mode === ModeType.Frontmatter && !frontmatterDone) {
                if (line.substring(0, 3) === FRONTMATTER_SIGN) {
                    frontmatterDone = true
                }
            }


            else if (isProperBulletVal) {
                if (mode !== ModeType.List) {
                    mode = ModeType.List
                    isFirstOfMode = true
                    stack = []
                }
                type = NodeType.ListUnordered
                stripped = trimmed.slice(2)
                indent = leadingIndent
            }

            else if (trimmed === '') {
                mode = ModeType.None
                stack = []
            }

            else if (trimmed.substring(0, 1) === QUOTE_SIGN) {

                let i = 0
                let quoteLevel = 0
                let quoteLevelPos = 0

                for (; trimmed[i] === '>';) {
                    quoteLevel++
                    quoteLevelPos = i
                    const trim = trimmed.slice(i + 1)
                    const advance = trim.search(/\S|$/)
                    i = i + advance + 1
                }

                const strippedAfterLastQuote = trimmed.slice(quoteLevelPos + 1)
                const strippedBeforeNextChar = trimmed.slice(i)

                stripped = strippedBeforeNextChar

                const indentFromQuoteLevel = strippedAfterLastQuote.search(/\S|$/);
                isQuotedBullet = [DASH_SIGN, BULLET_SIGN].includes(strippedBeforeNextChar.substring(0, 2))

                if (strippedBeforeNextChar.substring(0, 2) === CALLOUT_HEADER_SIGN) {
                    if (mode !== ModeType.CallOut) {
                        mode = ModeType.CallOut
                        isFirstOfMode = true
                        stack = []
                    }
                    type = NodeType.CallOutHeader
                    calloutLevel = quoteLevel
                    indent = quoteLevel - 1
                }

                else if (mode === ModeType.CallOut) {
                    type = NodeType.Quote
                    mode = ModeType.CallOut

                    indent = isQuotedBullet ? quoteLevel + indentFromQuoteLevel : quoteLevel

                    // indent = quoteLevel
                }

                else {
                    if (mode !== ModeType.Quote) {
                        mode = ModeType.Quote
                        isFirstOfMode = true
                    }
                    type = NodeType.Quote
                    indent = quoteLevel - 1
                }

            }



            else {

                ordinal = ifOrderedListItemReturnOrdinal(trimmed)
                tr = parseMarkdownTableRow(trimmed)

                if (ordinal) {
                    if (mode !== ModeType.List) {
                        mode = ModeType.List
                        isFirstOfMode = true
                        stack = []
                    }
                    type = NodeType.ListOrdered
                    stripped = trimmed.slice(String(ordinal).length + 2)
                    indent = leadingIndent
                }

                else if (tr) {
                    if (mode !== ModeType.Table) {
                        mode = ModeType.Table
                        isFirstOfMode = true
                        stack = []
                        type = NodeType.TableHeader
                    }
                    else if (tr.isDivider) {
                        type = NodeType.TableDivider
                        headerId = `${i - 1}`.padStart(4, '0')
                    }
                    else {
                        type = NodeType.TableRow
                    }
                    cols = tr.cols
                    stripped = trimmed
                    indent = isFirstOfMode ? 0 : 2
                }

                else {
                    type = NodeType.Other
                    stripped = trimmed
                    if (mode === ModeType.CallOut) {
                        indent = calloutLevel
                    }
                    else if (mode !== ModeType.Other) {
                        mode = ModeType.Other
                        isFirstOfMode = true

                    }
                }


            }

            internals[id] = {
                raw: line,
                trimmed: trimmed,
                stripped: stripped,
                type: type,
                mode: mode,
                debug: debug,
                calloutLevel,
                isQuotedBullet,
                isFirstOfMode,
                ordinal,
                cols,
                headerId,
            };

            (types[type] ||= []).push(id);

            if (indent >= stack.length - 1) {
                stack[indent] = id
            }
            else {
                stack = stack.slice(0, indent + 1)
                stack[indent] = id
            }

            const parentId = lastNonEmptyElement(stack, 1)
            if (parentId) {
                (children[parentId] ||= []).push(id);
                parents[id] = parentId;
            }

            if (indent === 0) {
                roots[id] = {};
            }


        }

        return {
            children,
            internals,
            parents,
            roots,
        }

    }

    private buildAncestorsAndDescendantsIndexes(): void {

        this.descendants = {}
        this.ancestors = {}

        // ### Ancestors iteration

        for (let i = 0; i < Object.keys(this.internals).length; i++) {
            const id = Object.keys(this.internals)[i]

            const parentId = this.parents[id]

            if (!parentId) {
                this.ancestors[id] = []
            }
            else {
                this.ancestors[id] = this.ancestors[id] || []
                this.ancestors[parentId] = this.ancestors[parentId] || []
                this.ancestors[id] = [...this.ancestors[id], parentId, ...this.ancestors[parentId]]
            }

        }

        // ### Descendants iteration

        for (let i = 0; i < Object.keys(this.internals).length; i++) {
            const id = Object.keys(this.internals)[i]

            this.descendants[id] = this.descendants[id] || []
            const ancestorsOfId = this.ancestors[id];

            ancestorsOfId.forEach(ancestorId => {
                (this.descendants[ancestorId] ||= []).push(id);
            })

        }
    }

    public reparentNode = (childToBeId: NodeId, parentToBeId: NodeId): void => {

        if (!(childToBeId in this.internals && parentToBeId in this.internals)) {
            throw new Error('Missing nodes')
        }

        if (this.children[parentToBeId] && this.children[parentToBeId].includes(childToBeId)) {
            throw new Error('Parent-child relationship allready exists.')
        }

        // Remove child from original parents children index
        const parentAsIsId = childToBeId in this.parents ? this.parents[childToBeId] : '';
        if (parentAsIsId) {
            this.children[parentAsIsId] = this.children[parentAsIsId].filter(id => id !== childToBeId)
        }

        // Add child to new parent's children index
        (this.children[parentToBeId] ||= []).push(childToBeId);

        // Add new parent to child's parent index
        this.parents[childToBeId] = parentToBeId;

        this.buildAncestorsAndDescendantsIndexes()

    }

    public stringify = (explIncludes?: ExplicitIncludes): string => {

        let str = ''

        const depthFirstStringify = (id: string, level: number) => {
            const internals = this.internals[id]
            const include = !explIncludes || explIncludes[Number(id)]


            if (internals && include) {

                if (explIncludes && internals.isFirstOfMode) {
                    str += '\n'
                }

                if (internals.mode === ModeType.Frontmatter) {
                    // pass
                }

                else if (internals.mode === ModeType.List) {
                    // str += OUTPUT_INDENT_STEP.repeat(level)

                    this.ancestors[id].forEach(_id => {
                        const anc = this.internals[_id]
                        if (anc.ordinal) {
                            str += OUTPUT_INDENT.repeat(String(anc.ordinal).length + OUTPUT_ORDINAL_SIGN.length)
                        }
                        else {
                            str += OUTPUT_INDENT_STEP
                        }
                    })
                   
                    if (internals.type === NodeType.ListOrdered) {
                        str += internals.ordinal
                        str += OUTPUT_ORDINAL_SIGN
                    }
                    else {
                        str += OUTPUT_BULLET
                    }

                    str += internals.stripped
                    str += '\n'
                }

                else if (internals.mode === ModeType.CallOut) {

                    if (internals.type === NodeType.CallOutHeader) {
                        str += OUTPUT_QUOTE
                    }

                    if (internals.isQuotedBullet) {
                        str += OUTPUT_QUOTE.repeat(internals.calloutLevel)
                        str += OUTPUT_INDENT_STEP.repeat(level - internals.calloutLevel)
                        str += internals.stripped
                        str += '\n'
                    }
                    else {
                        str += OUTPUT_QUOTE.repeat(level)
                        str += internals.stripped
                        str += '\n'
                    }


                }

                else if (internals.type === NodeType.Quote) {
                    str += OUTPUT_QUOTE.repeat(level + 1)
                    str += internals.stripped
                    str += '\n'
                }

                else if (internals.mode === ModeType.Table) {
                    str += internals.stripped
                    str += '\n'
                }

                else {
                    str += internals.stripped
                    str += '\n'
                }


                this.children[id]?.forEach(childId => depthFirstStringify(childId, level + 1))

            }

            else if (internals) {

                // Some includes are implicit, like table divider rows.

                if (internals.type === NodeType.TableDivider) {
                    // const headerId: NodeId = `${Number(internals.id)}`.padStart(4, '0')
                    if (explIncludes[Number(internals.headerId)]) {
                        str += internals.stripped
                        str += '\n'
                    }
                }

            }

        }

        Object.keys(this.roots).forEach(id => {
            depthFirstStringify(id, 0)
        })

        return str

    }

    public stringifyBranchesOfNodesWithLinks = (lineNumbers: number[]) => {

        // Use array as map to reduce iterations
        const explIncludes: ExplicitIncludes = []

        lineNumbers.forEach(lineNumber => {

            const id: NodeId = `${lineNumber}`.padStart(4, '0')

            explIncludes[lineNumber] = true
            this.ancestors[id].forEach(_id => { explIncludes[Number(_id)] = true })
            this.descendants[id].forEach(_id => { explIncludes[Number(_id)] = true })


        })

        return this.stringify(explIncludes)
    }

}


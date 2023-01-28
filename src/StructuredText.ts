
const BULLET_SIGN = '* '
const DASH_SIGN = '- '
const QUOTE_SIGN = '>'
const CALLOUT_HEADER_SIGN = '[!'

export type NodeId = string;

export enum ModeType {
    List = 'LIST',
    CallOut = 'CALLOUT',
    None = 'NONE',
}

export enum NodeType {
    ListItem = 'LIST_ITEM',
    CallOutHeader = 'CALLOUT_HEADER',
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
    debug: any;
}

export type InternalsIndex = { [key: NodeId]: NodeInternal }
export type ChildrenIndex = { [key: NodeId]: NodeId[] }
export type ParentsIndex = { [key: NodeId]: NodeId }
export type DescendantsIndex = { [key: NodeId]: NodeId[] }
export type AncestorsIndex = { [key: NodeId]: NodeId[] }
export type TypeIndex = { [key in NodeType]: NodeId[] }


export class StructuredText {

    raw: string;
    internals: InternalsIndex;
    children: ChildrenIndex;
    parents: ParentsIndex;
    types: TypeIndex;
    descendants: DescendantsIndex = {}
    ancestors: AncestorsIndex = {}


    constructor(raw: string) {
        const { internals, children, parents } = this.parseIndentedText(raw)

        this.raw = raw
        this.internals = internals
        this.children = children
        this.parents = parents

        this.buildAncestorsAndDescendantsIndexes()
    }

    private parseIndentedText(text: string): { internals: InternalsIndex, children: ChildrenIndex, parents: ParentsIndex } {

        const lines = text.split('\n');
        const internals: InternalsIndex = {}
        const children: ChildrenIndex = {}
        const parents: ParentsIndex = {}
        const types: TypeIndex = {
            [NodeType.ListItem]: [],
            [NodeType.CallOutHeader]: [],
            [NodeType.Other]: [],
            [NodeType.Quote]: [],
            [NodeType.Blank]: [],
        }

        let stack: NodeId[] = []
        let mode: ModeType = ModeType.None
        let calloutLevel = 0


        const lastNonEmptyElement = (stack: NodeId[], offset = 0): NodeId | null => {
            let ret = [...stack].slice(0, -offset)
            for (let i = stack.length; i >= 0; i--) {
                if (!ret[i]) {
                    ret = ret.slice(0, i)
                }
                else {
                    return ret[i]
                }
            }
            return null
        }


     
      

        for (let i = 0; i < lines.length; i++) {

            const line = lines[i]
            const leadingIndent = line.search(/\S|$/);
            const trimmed = line.slice(leadingIndent);
            const id: NodeId = `${i}`.padStart(4, '0')

            let stripped = ''
            let type: NodeType
            let indent = 0

        
            // ===== start sline

            if ([DASH_SIGN, BULLET_SIGN].includes(trimmed.substring(0, 2))) {
                stack = mode === ModeType.List ? stack : []
                type = NodeType.ListItem
                mode = ModeType.List
                stripped = trimmed.slice(2)
                indent = leadingIndent
            }

            else if (trimmed === '') {
                mode = ModeType.None
                stack = []
            }

            else if (trimmed.substring(0, 1) === QUOTE_SIGN) {

                let quoteLevel = 0
                let i = 0

                for (; trimmed[i] === '>';) {
                    quoteLevel++
                    const trim = trimmed.slice(i + 1)
                    const advance = trim.search(/\S|$/)
                    i = i + advance + 1
                }

                stripped = trimmed.slice(i)

                if (stripped.substring(0, 2) === CALLOUT_HEADER_SIGN) {
                    type = NodeType.CallOutHeader
                    stack = mode === ModeType.CallOut ? stack : []
                    mode = ModeType.CallOut
                    calloutLevel = quoteLevel
                    indent = quoteLevel - 1
                }

                else if (mode === ModeType.CallOut) {
                    type = NodeType.Quote
                    mode = ModeType.CallOut
                    indent = quoteLevel 
                }

                else {
                    type = NodeType.Quote
                    mode = ModeType.None
                    indent = quoteLevel - 1
                }

            }

            else {

                type = NodeType.Other
                if (mode === ModeType.CallOut) {
                    indent = calloutLevel 
                }
                else {
                    mode = ModeType.None
                }

            }

            internals[id] = {
                raw: line,
                trimmed: trimmed,
                stripped: stripped,
                type: type,
                mode: mode,
                debug: indent,
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


        }

        return {
            children,
            internals,
            parents
        }

    }

    private buildAncestorsAndDescendantsIndexes (): void {
    
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

        // const internals: InternalsIndex = { ..._indexState.internals }
        // const children: ChildrenIndex = { ..._indexState.children }
        // const parents: ParentsIndex = { ..._indexState.parents }
    
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

}


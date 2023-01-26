
const BULLET_SIGN = '* '
const DASH_SIGN = '- '
const QUOTE_SIGN = '>'
const CALLOUT_HEADER_SIGN = '[!'

export type NodeId = string;

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
    type: NodeType
    stripped: string;
}

export type InternalsIndex = { [key: NodeId]: NodeInternal }
export type ChildrenIndex = { [key: NodeId]: NodeId[] }
export type ParentsIndex = { [key: NodeId]: NodeId }
export type DescendantsIndex = { [key: NodeId]: NodeId[] }
export type AncestorsIndex = { [key: NodeId]: NodeId[] }
export type TypeIndex = { [key in NodeType]: NodeId[] }

export interface IndexState {
    internals: InternalsIndex;
    children: ChildrenIndex;
    types: TypeIndex;
    parents: ParentsIndex
}


export function parseIndentedText(text: string): IndexState {

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

    const determineMode = (mode: NodeType, type: NodeType): NodeType => {
        if (type === NodeType.Blank) {
            return type
        }
        else if (mode === NodeType.Blank) {
            return type
        }
        else {
            return mode
        }
        // else if (type === NodeType.ListItem && mode !== NodeType.ListItem) {
        //     return type
        // }
    }

    const determineType = (trimmed: string): NodeType => {
        if ([DASH_SIGN, BULLET_SIGN].includes(trimmed.substring(0, 2))) {
            return NodeType.ListItem
        }
        else if (trimmed.substring(0, 2) === CALLOUT_HEADER_SIGN) {
            return NodeType.CallOutHeader
        }
        else if (trimmed.substring(0, 1) === QUOTE_SIGN) {
            return NodeType.Quote
        }
        else if (trimmed === '') {
            return NodeType.Blank
        }
        else {
            return NodeType.Other
        }
    }

    const destructureByTypeAndMode = (trimmed: string, type: NodeType, mode: NodeType): {
        stripped: string,
        indent2: number,
    } => {

        if (type === NodeType.ListItem) {
            return {
                stripped: trimmed.slice(2),
                indent2: 0,
            }
        }
        else if (type === NodeType.Quote) {

            let quoteLevel = 0
            let i = 0

            for (; trimmed[i] === '>';) {
                quoteLevel++
                const trim = trimmed.slice(i + 1)
                const advance = trim.search(/\S|$/)
                i = i + advance + 1
            }

            return {
                stripped: trimmed.slice(i),
                indent2: quoteLevel * 2,
            }
        }
        else {
            return {
                stripped: trimmed,
                indent2: 0
            }
        }
    }

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
    let mode: NodeType = NodeType.Blank

    for (let i = 0; i < lines.length; i++) {

        const line = lines[i]
        const indent1 = line.search(/\S|$/);
        const trimmed = line.slice(indent1);
        const id: NodeId = `${i}`.padStart(4, '0')
        const type = determineType(trimmed)

        const mode2 = determineMode(mode, type)
        if (mode2 !== mode) {
            mode = mode2;
            stack = [];
        }



        const { stripped, indent2 } = destructureByTypeAndMode(trimmed, type, mode)

        internals[id] = {
            raw: line,
            trimmed: trimmed,
            stripped: stripped,
            type: type,

        };

        (types[type] ||= []).push(id);


        const indent = indent1 + indent2

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


    const indexState: IndexState = {
        internals,
        children,
        parents,
        types
    }

    // console.log('is', indexState)

    return indexState
}


export const reparentNode = (childToBeId: NodeId, parentToBeId: NodeId, _indexState: IndexState): IndexState => {

    const internals: InternalsIndex = { ..._indexState.internals }
    const children: ChildrenIndex = { ..._indexState.children }
    const parents: ParentsIndex = { ..._indexState.parents }

    if (!(childToBeId in internals && parentToBeId in internals)) {
        throw new Error('Missing nodes')
    }

    if (children[parentToBeId] && children[parentToBeId].includes(childToBeId)) {
        throw new Error('Parent-child relationship allready exists.')
    }

    // Remove child from original parents children index
    const parentAsIsId = childToBeId in parents ? parents[childToBeId] : '';
    if (parentAsIsId) {
        children[parentAsIsId] = children[parentAsIsId].filter(id => id !== childToBeId)
    }

    // Add child to new parent's children index
    (children[parentToBeId] ||= []).push(childToBeId);

    // Add new parent to child's parent index
    parents[childToBeId] = parentToBeId;

    // Rebuild ancestors and descendants (take this out of this function concern?)


    const indexState: IndexState = {
        ..._indexState,
        children,
        parents,
    }

    return indexState

}

export const buildAncestorsAndDescendantsIndexes = (is: IndexState): {
    descendants: DescendantsIndex,
    ancestors: AncestorsIndex,
} => {

    const descendants: DescendantsIndex = {}
    const ancestors: AncestorsIndex = {}

    // ### Ancestors iteration

    for (let i = 0; i < Object.keys(is.internals).length; i++) {
        const id = Object.keys(is.internals)[i]

        const parentId = is.parents[id]

        if (!parentId) {
            ancestors[id] = []
        }
        else {
            ancestors[id] = ancestors[id] || []
            ancestors[parentId] = ancestors[parentId] || []
            ancestors[id] = [...ancestors[id], parentId, ...ancestors[parentId]]
        }

    }

    // ### Descendants iteration

    for (let i = 0; i < Object.keys(is.internals).length; i++) {
        const id = Object.keys(is.internals)[i]

        descendants[id] = descendants[id] || []
        const ancestorsOfId = ancestors[id];

        ancestorsOfId.forEach(ancestorId => {
            (descendants[ancestorId] ||= []).push(id);
        })

    }


    return {
        descendants,
        ancestors
    }
}
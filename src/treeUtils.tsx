const SHOW_ANCESTORS = true
const CALLOUT_SIGN = '> '
const CALLOUT_HEADER_SIGN = '[!'
const BULLET_SIGN = '* '

export type TreeNode = {
    text: string;
    indent: number;
    plain: string;
    children?: TreeNode[];
    lineNum?: number;
    calloutLevel: number;
    calloutTitle: string;
}

export type NodeLookup = {
    [key: string]: number[] 
}


export const makeLineItemsFromIndentedText = (text: string): TreeNode[] => {

    const lines: TreeNode[] = text.split('\n').map((line, i) => {

        let calloutLevel = 0

        for (let i = 0; i < line.length; i++) {
            const subStart = i * CALLOUT_SIGN.length
            const subEnd = subStart + CALLOUT_SIGN.length
            const sub = line.substring(subStart, subEnd)
            if (sub !== CALLOUT_SIGN) {
                break;
            }
            else {
                calloutLevel += 1
            }
        }

        const lineWithoutCallouts: string = line.substring(calloutLevel * CALLOUT_SIGN.length)
        const lineTrimmed = lineWithoutCallouts.trim()
        const indent = lineWithoutCallouts.search(/\S/) // String search (returns index of first match) for first any non-whitespace character in the line
        const lineIsCalloutHeader = lineTrimmed.substring(0, 2) === CALLOUT_HEADER_SIGN

        let calloutTitle = ''
        let calloutPlain = ''
        if (lineIsCalloutHeader) {
            const index = lineTrimmed.indexOf(']')
            calloutTitle = lineTrimmed.slice(2, index) || 'Note'
            calloutPlain = lineTrimmed.slice(index + 1)
        }

        // const calloutTitle = lineIsCalloutHeader ? lineTrimmed.trim().split(']')[0].substring(2) || 'Note' : ''
        const calloutIndents = calloutLevel > 0 ? lineIsCalloutHeader ? calloutLevel - 1 : calloutLevel: 0

        return {
            text: lineTrimmed,
            indent: indent + calloutIndents,
            plain: lineIsCalloutHeader ? calloutPlain : lineTrimmed.trim(),
            calloutLevel: calloutLevel,
            calloutTitle: calloutTitle,
        }
    })


    // Prune frontmatter if present
    if (lines[0].text === '---') {
        const prunedLines: TreeNode[] = []
        let passedFrontmatter = false
        for (let i = 1; i < lines.length; i++) {
            if (passedFrontmatter) {
                prunedLines.push(lines[i])
            }
            else if (lines[i].text === '---') {
                passedFrontmatter = true
            }
        }
        return prunedLines
    }

    return lines

}


export const makeNodeTreefromLineItems = (lines: TreeNode[]): TreeNode[] => {

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


export const recursivelyBuildLookup = (nodeTree: TreeNode[]): NodeLookup => {

    const nodeLookup: NodeLookup = {}

    const traverse = (node: TreeNode, adr: number[]) => {
        nodeLookup[node.lineNum] = adr
        node.children.forEach((_node, _i) => traverse(_node, [...adr, _i]))
    }

    nodeTree.forEach((node, i) => { traverse(node, [i]) })

    return nodeLookup

}


export const nodeToMarkdownSummary = (lineNum: number, nodeLookup: NodeLookup, nodeTree: TreeNode[]): string => {
    const lookup = nodeLookup[lineNum]

    let output = ''

    const traverse = (node: TreeNode, level: number, _lookup: number[]) => {

        const lookup = _lookup.slice(1)

        if (lookup.length) {
            if (SHOW_ANCESTORS) {
                output = output + parseNodeToMd(node, level, true)
            }
            traverse(node.children[lookup[0]], level + 1, lookup)
        }
        else {
            output = output + parseNodeToMd(node, level, false)
            node.children.forEach(node => { traverse(node, level + 1, lookup) })
        }

    }

    traverse(nodeTree[lookup[0]], 0, lookup)

    console.log('ou', output)

    return output

}

export const treeToMarkdownSummary = (nodeTree: TreeNode[]): string => {

    let output = ''

    const traverse = (node: TreeNode, level: number) => {
        output = output + parseNodeToMd(node, level, false)
        node.children.forEach(node => { traverse(node, level + 1) })
    }

    nodeTree.forEach((node: TreeNode) => {
        traverse(node, 0)
    })

    console.log('out', output)

    return output
}


export const parseNodeToMd = (node: TreeNode, level: number, isAncestor: boolean): string => {

    const hasLeadingBullet = node.plain.substring(0, 2) === BULLET_SIGN
    const stringWithoutBullet = hasLeadingBullet ? node.plain.slice(2) : node.plain.trim()
    const isCallout = node.calloutLevel > 0
    const bulletForCallouts = isCallout && !hasLeadingBullet ? BULLET_SIGN : ''

    const spanProps = []
    const innerString = stringWithoutBullet || node.calloutTitle || '' // node.calloutTitle ? `<span data-callout-title-text="">${node.calloutTitle}</span> ${str}` : str

    if (isCallout) {
        if (node.calloutTitle) {
            spanProps.push(`data-callout-title="${node.calloutTitle.toLowerCase()}" class="callout" data-callout="${node.calloutTitle.toLowerCase()}"`)
        }
    }
    if (isAncestor) {
       spanProps.push(`class="ancestor"`)
    }

    const spanWrapped = spanProps.length ? `<span ${spanProps.join(" ")}>${innerString}</span>` : innerString

    const line = hasLeadingBullet || bulletForCallouts ? `* ${spanWrapped}` : spanWrapped

    const lineOutput = `${' '.repeat(2 * level)}${line}\n`

    return lineOutput

}
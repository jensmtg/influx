const SHOW_ANCESTORS = true


export type TreeNode = {
    text: string;
    indent: number;
    plain: string;
    children?: TreeNode[];
    lineNum?: number;
}

export type NodeLookup = {
    [key: string]: number[] 
}


export const makeLineItemsFromIndentedText = (text: string): TreeNode[] => {


    const lines: TreeNode[] = text.split('\n').map((line, i) => {
        return {
            text: line,
            indent: line.search(/\S/),  // String search (returns index of first match) for first any non-whitespace character in the line
            plain: line.trim(),
        }
    })

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

    traverse(nodeTree[lookup[0]], 0, lookup)

    return output

}

export const treeToMarkdownSummary = (nodeTree: TreeNode[]): string => {

    let output = ''

    const traverse = (node: TreeNode, level: number) => {
        output = output + `${' '.repeat(2 * level)}${node.plain}\n`
        node.children.forEach(node => { traverse(node, level + 1) })
    }

    nodeTree.forEach((node: TreeNode) => {
        traverse(node, 0)
    })

    return output
}
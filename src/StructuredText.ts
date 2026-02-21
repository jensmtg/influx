import { buildAncestorsAndDescendantsIndexes, buildRoots } from './utils/structured-text-graph';
import { parseText } from './utils/structured-text-parser';
import {
    stringify as stringifyStructuredText,
    stringifyBranchesOfNodesWithLinks
} from './utils/structured-text-stringify';
import type {
    AncestorsIndex,
    ChildrenIndex,
    DescendantsIndex,
    ExplicitIncludes,
    InternalsIndex,
    NodeId,
    ParentsIndex,
    RootsIndex,
    StructuredTextState
} from './types/structured-text';
export { ModeType, NodeType } from './types/structured-text';
export type {
    ExplicitIncludes,
    NodeId,
    NodeInternal,
    InternalsIndex,
    ChildrenIndex,
    ParentsIndex,
    DescendantsIndex,
    AncestorsIndex,
    RootsIndex
} from './types/structured-text';

export class StructuredText {

    raw: string;
    internals: InternalsIndex;
    children: ChildrenIndex;
    parents: ParentsIndex;
    descendants: DescendantsIndex = {}
    ancestors: AncestorsIndex = {}
    roots: RootsIndex = {}


    constructor(raw: string) {
        const { internals, children, parents, roots } = parseText(raw)
        this.raw = raw
        this.internals = internals
        this.children = children
        this.parents = parents
        this.roots = roots

        this.buildAncestorsAndDescendantsIndexes()
    }

    private buildAncestorsAndDescendantsIndexes(): void {
        const { ancestors, descendants } = buildAncestorsAndDescendantsIndexes(this.internals, this.parents)
        this.ancestors = ancestors
        this.descendants = descendants
    }

    private rebuildRoots(): void {
        this.roots = buildRoots(this.internals, this.parents)
    }

    private getState(): StructuredTextState {
        return {
            internals: this.internals,
            children: this.children,
            ancestors: this.ancestors,
            descendants: this.descendants,
            roots: this.roots,
        }
    }

    public reparentNode = (childToBeId: NodeId, parentToBeId: NodeId): void => {

        if (!(childToBeId in this.internals && parentToBeId in this.internals)) {
            throw new Error('Missing nodes')
        }

        if (this.children[parentToBeId] && this.children[parentToBeId].includes(childToBeId)) {
            throw new Error('Parent-child relationship already exists.')
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
        this.rebuildRoots()

    }

    public stringify = (explIncludes?: ExplicitIncludes): string => {
        return stringifyStructuredText(this.getState(), explIncludes)
    }

    public stringifyBranchesOfNodesWithLinks = (lineNumbers: number[]) => {
        return stringifyBranchesOfNodesWithLinks(this.getState(), lineNumbers)
    }

}


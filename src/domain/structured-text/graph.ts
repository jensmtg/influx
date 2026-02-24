import type {
    AncestorsIndex,
    DescendantsIndex,
    InternalsIndex,
    ParentsIndex,
    RootsIndex,
} from './types';

export function buildAncestorsAndDescendantsIndexes(
    internals: InternalsIndex,
    parents: ParentsIndex
): { ancestors: AncestorsIndex; descendants: DescendantsIndex } {
    const descendants: DescendantsIndex = {};
    const ancestors: AncestorsIndex = {};

    const nodeIds = Object.keys(internals);

    for (const id of nodeIds) {
        const parentId = parents[id];

        if (!parentId) {
            ancestors[id] = [];
        }
        else {
            ancestors[id] = ancestors[id] || [];
            ancestors[parentId] = ancestors[parentId] || [];
            ancestors[id] = [...ancestors[id], parentId, ...ancestors[parentId]];
        }
    }

    for (const id of nodeIds) {
        descendants[id] = descendants[id] || [];
        const ancestorsOfId = ancestors[id];

        ancestorsOfId.forEach(ancestorId => {
            (descendants[ancestorId] ||= []).push(id);
        });
    }

    return { ancestors, descendants };
}

export function buildRoots(internals: InternalsIndex, parents: ParentsIndex): RootsIndex {
    const roots: RootsIndex = {};
    Object.keys(internals).forEach(id => {
        if (!parents[id]) {
            roots[id] = true;
        }
    });
    return roots;
}

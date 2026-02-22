import type { ExplicitIncludes, NodeId, StructuredTextState } from '../types/structured-text';
import { ModeType, NodeType } from '../types/structured-text';
import {
    NODE_ID_PAD_LENGTH,
    OUTPUT_BULLET,
    OUTPUT_INDENT,
    OUTPUT_INDENT_STEP,
    OUTPUT_ORDINAL_SIGN,
    OUTPUT_QUOTE,
} from './structured-text-constants';

export function stringify(state: StructuredTextState, explIncludes?: ExplicitIncludes): string {
    let str = '';
    const appendAncestorIndent = (id: NodeId): void => {
        state.ancestors[id]?.forEach(_id => {
            const anc = state.internals[_id];
            if (!anc) {
                return;
            }
            if (anc.ordinal) {
                str += OUTPUT_INDENT.repeat(String(anc.ordinal).length + OUTPUT_ORDINAL_SIGN.length);
            }
            else {
                str += OUTPUT_INDENT_STEP;
            }
        });
    };

    const depthFirstStringify = (id: NodeId, level: number) => {
        const internals = state.internals[id];
        const include = !explIncludes || explIncludes[Number(id)];

        if (internals && include) {
            if (explIncludes && internals.isFirstOfMode && level === 0) {
                str += '\n';
            }

            if (internals.mode === ModeType.Frontmatter) {
                // pass
            }
            else if (internals.mode === ModeType.List) {
                appendAncestorIndent(id);

                if (internals.type === NodeType.ListOrdered) {
                    str += internals.ordinal;
                    str += OUTPUT_ORDINAL_SIGN;
                }
                else {
                    str += OUTPUT_BULLET;
                }

                str += internals.stripped;
                str += '\n';
            }
            else if (internals.mode === ModeType.CallOut) {
                if (internals.type === NodeType.CallOutHeader) {
                    str += OUTPUT_QUOTE;
                }

                if (internals.isQuotedBullet) {
                    str += OUTPUT_QUOTE.repeat(internals.calloutLevel || 0);
                    str += OUTPUT_INDENT_STEP.repeat(level - (internals.calloutLevel || 0));
                    str += internals.stripped;
                    str += '\n';
                }
                else {
                    str += OUTPUT_QUOTE.repeat(level);
                    str += internals.stripped;
                    str += '\n';
                }
            }
            else if (internals.type === NodeType.Quote) {
                str += OUTPUT_QUOTE.repeat(level + 1);
                str += internals.stripped;
                str += '\n';
            }
            else if (internals.mode === ModeType.Table) {
                str += internals.stripped;
                str += '\n';
            }
            else {
                appendAncestorIndent(id);
                str += internals.stripped;
                str += '\n';
            }

            state.children[id]?.forEach(childId => depthFirstStringify(childId, level + 1));
        }
        else if (internals) {
            if (internals.type === NodeType.TableDivider) {
                if (explIncludes && explIncludes[Number(internals.headerId)]) {
                    str += internals.stripped;
                    str += '\n';
                }
            }
        }
    };

    Object.keys(state.roots).forEach(id => {
        depthFirstStringify(id, 0);
    });

    return str;
}

export function stringifyBranchesOfNodesWithLinks(
    state: StructuredTextState,
    lineNumbers: number[]
): string {
    const explIncludes: ExplicitIncludes = [];

    lineNumbers.forEach(lineNumber => {
        const id: NodeId = `${lineNumber}`.padStart(NODE_ID_PAD_LENGTH, '0');

        explIncludes[lineNumber] = true;
        state.ancestors[id]?.forEach(_id => { explIncludes[Number(_id)] = true; });
        state.descendants[id]?.forEach(_id => { explIncludes[Number(_id)] = true; });
    });

    return stringify(state, explIncludes);
}

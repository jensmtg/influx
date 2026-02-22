import type {
    ChildrenIndex,
    InternalsIndex,
    NodeId,
    ParentsIndex,
    ParsedText,
    RootsIndex,
} from '../types/structured-text';
import { ModeType, NodeType } from '../types/structured-text';
import {
    BULLET_SIGN,
    CALLOUT_HEADER_SIGN,
    DASH_SIGN,
    FRONTMATTER_SIGN,
    NODE_ID_PAD_LENGTH,
    QUOTE_SIGN,
    TABLE_INDENT_INITIAL,
    TABLE_INDENT_SUBSEQUENT,
} from './structured-text-constants';
import {
    calculateLeadingIndent,
    generateNodeId,
    ifOrderedListItemReturnOrdinal,
    isProperBullet,
    lastNonEmptyElement,
    parseMarkdownTableRow,
} from './structured-text-utils';

export function parseText(text: string): ParsedText {
    const lines = text.split('\n');
    const internals: InternalsIndex = {};
    const children: ChildrenIndex = {};
    const parents: ParentsIndex = {};
    const roots: RootsIndex = {};

    let stack: NodeId[] = [];
    let mode: ModeType = ModeType.None;
    let calloutLevel = 0;
    let frontmatterDone = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const leadingIndent = calculateLeadingIndent(line);
        const trimmed = line.slice(leadingIndent);
        const id: NodeId = generateNodeId(i);
        const isProperBulletVal = isProperBullet(trimmed);

        let stripped = '';
        let type: NodeType = NodeType.Other;
        let indent = 0;
        let isQuotedBullet = false;
        let isFirstOfMode = false;
        let ordinal: number | undefined;
        let tr: null | { cols: number; isDivider: boolean };
        let cols: number = 0;
        let headerId: string = '';

        if (i === 0 && trimmed === FRONTMATTER_SIGN) {
            mode = ModeType.Frontmatter;
        }
        else if (mode === ModeType.Frontmatter && !frontmatterDone) {
            if (trimmed === FRONTMATTER_SIGN) {
                frontmatterDone = true;
            }
        }
        else if (isProperBulletVal) {
            if (mode !== ModeType.List) {
                mode = ModeType.List;
                isFirstOfMode = true;
                stack = [];
            }
            type = NodeType.ListUnordered;
            stripped = trimmed.slice(2);
            indent = leadingIndent;
        }
        else if (trimmed === '') {
            mode = ModeType.None;
            stack = [];
        }
        else if (trimmed.substring(0, 1) === QUOTE_SIGN) {
            let j = 0;
            let quoteLevel = 0;
            let quoteLevelPos = 0;

            for (; trimmed[j] === '>';) {
                quoteLevel++;
                quoteLevelPos = j;
                const trim = trimmed.slice(j + 1);
                const advance = trim.search(/\S|$/);
                j = j + advance + 1;
            }

            const strippedAfterLastQuote = trimmed.slice(quoteLevelPos + 1);
            const strippedBeforeNextChar = trimmed.slice(j);

            stripped = strippedBeforeNextChar;

            const indentFromQuoteLevel = strippedAfterLastQuote.search(/\S|$/);
            isQuotedBullet = [DASH_SIGN, BULLET_SIGN].includes(strippedBeforeNextChar.substring(0, 2));

            if (strippedBeforeNextChar.substring(0, 2) === CALLOUT_HEADER_SIGN) {
                if (mode !== ModeType.CallOut) {
                    mode = ModeType.CallOut;
                    isFirstOfMode = true;
                    stack = [];
                }
                type = NodeType.CallOutHeader;
                calloutLevel = quoteLevel;
                indent = quoteLevel - 1;
            }
            else if (mode === ModeType.CallOut) {
                type = NodeType.Quote;
                mode = ModeType.CallOut;
                indent = isQuotedBullet ? quoteLevel + indentFromQuoteLevel : quoteLevel;
            }
            else {
                if (mode !== ModeType.Quote) {
                    mode = ModeType.Quote;
                    isFirstOfMode = true;
                }
                type = NodeType.Quote;
                indent = quoteLevel - 1;
            }
        }
        else {
            ordinal = ifOrderedListItemReturnOrdinal(trimmed);
            tr = parseMarkdownTableRow(trimmed);

            if (ordinal) {
                if (mode !== ModeType.List) {
                    mode = ModeType.List;
                    isFirstOfMode = true;
                    stack = [];
                }
                type = NodeType.ListOrdered;
                stripped = trimmed.slice(String(ordinal).length + 2);
                indent = leadingIndent;
            }
            else if (tr) {
                if (mode !== ModeType.Table) {
                    mode = ModeType.Table;
                    isFirstOfMode = true;
                    stack = [];
                    type = NodeType.TableHeader;
                }
                else if (tr.isDivider) {
                    type = NodeType.TableDivider;
                    headerId = `${i - 1}`.padStart(NODE_ID_PAD_LENGTH, '0');
                }
                else {
                    type = NodeType.TableRow;
                }
                cols = tr.cols;
                stripped = trimmed;
                indent = isFirstOfMode ? TABLE_INDENT_INITIAL : TABLE_INDENT_SUBSEQUENT;
            }
            else {
                type = NodeType.Other;
                stripped = trimmed;
                indent = leadingIndent;
                if (mode === ModeType.CallOut) {
                    indent = calloutLevel;
                }
                else if (mode !== ModeType.Other) {
                    mode = ModeType.Other;
                    isFirstOfMode = true;
                }
            }
        }

        internals[id] = {
            raw: line,
            trimmed: trimmed,
            stripped: stripped,
            type: type,
            mode: mode,
            calloutLevel,
            isQuotedBullet,
            isFirstOfMode,
            ordinal,
            cols,
            headerId,
        };

        if (indent >= stack.length - 1) {
            stack[indent] = id;
        }
        else {
            stack = stack.slice(0, indent + 1);
            stack[indent] = id;
        }

        const parentId = lastNonEmptyElement(stack, 1);
        if (parentId) {
            (children[parentId] ||= []).push(id);
            parents[id] = parentId;
        }

        if (indent === 0) {
            roots[id] = true;
        }
    }

    return {
        children,
        internals,
        parents,
        roots,
    };
}

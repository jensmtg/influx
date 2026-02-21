export type NodeId = string;
export type ExplicitIncludes = boolean[];

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
}

export type InternalsIndex = Record<NodeId, NodeInternal>;
export type ChildrenIndex = Record<NodeId, NodeId[]>;
export type ParentsIndex = Record<NodeId, NodeId>;
export type DescendantsIndex = Record<NodeId, NodeId[]>;
export type AncestorsIndex = Record<NodeId, NodeId[]>;
export type RootsIndex = Record<NodeId, true>;

export interface ParsedText {
    internals: InternalsIndex;
    children: ChildrenIndex;
    parents: ParentsIndex;
    roots: RootsIndex;
}

export interface StructuredTextState {
    internals: InternalsIndex;
    children: ChildrenIndex;
    ancestors: AncestorsIndex;
    descendants: DescendantsIndex;
    roots: RootsIndex;
}

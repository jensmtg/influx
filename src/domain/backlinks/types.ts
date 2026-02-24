import type { LinkCache } from 'obsidian';
import type { InlinkingFile } from '../../InlinkingFile';

export type BacklinksData = Map<string, LinkCache[]> | Record<string, LinkCache[]>;

export interface BacklinksObject {
	data: BacklinksData;
}

export interface ExtendedInlinkingFile {
	inlinkingFile: InlinkingFile;
	titleText: string;
	summaryMarkdown: string;
	sourcePath: string;
}

import type { InlinkingFile } from './inlinking-file';

export type { BacklinksObject } from '../../types/backlinks';

export interface ExtendedInlinkingFile {
	inlinkingFile: InlinkingFile;
	titleText: string;
	summaryMarkdown: string;
	sourcePath: string;
}

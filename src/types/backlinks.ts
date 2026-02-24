import type { LinkCache } from 'obsidian';

export type BacklinksData = Map<string, LinkCache[]> | Record<string, LinkCache[]>;

export interface BacklinksObject {
	data: BacklinksData;
}

import { TFile, normalizePath } from 'obsidian';
import type { BacklinksObject } from './types';

export interface InfluxFileVisibilityApi {
	getShowStatus: (file: TFile) => boolean;
	getCollapsedStatus: (file: TFile) => boolean;
}

export function resolveInfluxVisibility(
	file: TFile | null,
	api: InfluxFileVisibilityApi
): { show: boolean; collapsed: boolean } {
	if (!file) {
		return {
			show: false,
			collapsed: false,
		};
	}

	return {
		show: api.getShowStatus(file),
		collapsed: api.getCollapsedStatus(file),
	};
}

export function backlinksContainChangedPath(
	backlinks: BacklinksObject | null,
	changedPath: string
): boolean {
	if (!backlinks || !backlinks.data) {
		return false;
	}

	const normalizedChangedPath = normalizePath(changedPath);
	const backlinkPaths = backlinks.data instanceof Map
		? Array.from(backlinks.data.keys())
		: Object.keys(backlinks.data);

	return backlinkPaths.some((path) => normalizePath(path) === normalizedChangedPath);
}

import { TFile, normalizePath } from 'obsidian';
import type { ApiAdapter } from './api-adapter';
import type { BacklinksObject } from './types';
import { DEFAULT_SETTINGS } from '../../types';

export interface InfluxFileBuildApi {
	getFileByPath: ApiAdapter['getFileByPath'];
	isIncludableSource: ApiAdapter['isIncludableSource'];
}

function getBacklinkEntries(backlinks: BacklinksObject): Iterable<[string, unknown]> {
	if (!backlinks?.data) {
		return [];
	}

	return backlinks.data instanceof Map
		? backlinks.data.entries()
		: Object.entries(backlinks.data);
}

export function collectValidBacklinkFiles(params: {
	backlinks: BacklinksObject;
	currentFilePath: string;
	api: InfluxFileBuildApi;
}): TFile[] {
	const { backlinks, currentFilePath, api } = params;
	const normalizedCurrentPath = normalizePath(currentFilePath);
	const validFiles: TFile[] = [];

	for (const [pathAsKey] of getBacklinkEntries(backlinks)) {
		const normalizedSourcePath = normalizePath(pathAsKey);
		if (normalizedSourcePath === normalizedCurrentPath || !api.isIncludableSource(pathAsKey)) {
			continue;
		}

		const file = api.getFileByPath(pathAsKey);
		if (file !== null) {
			validFiles.push(file);
		}
	}

	return validFiles;
}

export function sortInfluxSourceFiles(
	files: TFile[],
	settings: typeof DEFAULT_SETTINGS
): TFile[] {
	const flip = settings.sortingPrinciple === 'NEWEST_FIRST' ? -1 : 1;
	const sortAttr = settings.sortingAttribute === 'mtime' ? 'mtime' : 'ctime';

	return [...files].sort((a, b) => {
		if (settings.sortingAttribute === 'FILENAME') {
			const aName = a.basename || '';
			const bName = b.basename || '';
			if (aName < bName) return -1 * flip;
			if (aName > bName) return 1 * flip;
			return 0;
		}

		const aTime = a.stat?.[sortAttr] || 0;
		const bTime = b.stat?.[sortAttr] || 0;
		if (aTime < bTime) return -1 * flip;
		if (aTime > bTime) return 1 * flip;
		return 0;
	});
}

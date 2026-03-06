import type { TFile } from 'obsidian';
import type { ExtendedInlinkingFile } from '../domain/backlinks/types';
import type { InfluxUpdateEvent } from '../app/events/influx-updates';

export type InfluxRenderMode = 'editor' | 'preview' | 'sidebar';

export interface SearchUiState {
	inputValue: string;
	searchQuery: string;
	isSearchExpanded: boolean;
	isSearchFocused: boolean;
}

export type SearchUiAction =
	| { type: 'INPUT_CHANGED'; value: string }
	| { type: 'QUERY_COMMITTED'; value: string }
	| { type: 'TOGGLE_PANEL' }
	| { type: 'FOCUS_CHANGED'; focused: boolean }
	| { type: 'RESET'; closePanel: boolean };

export function createInitialSearchUiState(): SearchUiState {
	return {
		inputValue: '',
		searchQuery: '',
		isSearchExpanded: false,
		isSearchFocused: false,
	};
}

export function reduceSearchUiState(state: SearchUiState, action: SearchUiAction): SearchUiState {
	switch (action.type) {
		case 'INPUT_CHANGED':
			return {
				...state,
				inputValue: action.value,
			};
		case 'QUERY_COMMITTED':
			return {
				...state,
				searchQuery: action.value,
			};
		case 'TOGGLE_PANEL': {
			const nextExpanded = !state.isSearchExpanded;
			return {
				...state,
				isSearchExpanded: nextExpanded,
				isSearchFocused: nextExpanded,
			};
		}
		case 'FOCUS_CHANGED':
			return {
				...state,
				isSearchFocused: action.focused,
			};
		case 'RESET':
			return {
				...state,
				inputValue: '',
				searchQuery: '',
				isSearchExpanded: action.closePanel ? false : state.isSearchExpanded,
				isSearchFocused: action.closePanel ? false : state.isSearchFocused,
			};
		default:
			return state;
	}
}

export const INITIAL_VISIBLE_COMPONENTS_BY_MODE: Record<InfluxRenderMode, number> = {
	editor: 40,
	preview: 80,
	sidebar: 80,
};

export const VISIBLE_COMPONENTS_CHUNK_BY_MODE: Record<InfluxRenderMode, number> = {
	editor: 30,
	preview: 50,
	sidebar: 50,
};

export function collectComponentPaths(components: ExtendedInlinkingFile[]): string[] {
	return components
		.map((component) => component.inlinkingFile.file?.path)
		.filter((path): path is string => path !== undefined);
}

export function collectInitialCollapsedPaths(params: {
	collapsed: boolean;
	components: ExtendedInlinkingFile[];
}): string[] {
	if (!params.collapsed || params.components.length === 0) {
		return [];
	}
	return collectComponentPaths(params.components);
}

const searchTextCache = new WeakMap<ExtendedInlinkingFile, string>();

export function getSearchText(item: ExtendedInlinkingFile): string {
	const cached = searchTextCache.get(item);
	if (cached) {
		return cached;
	}
	const basename = item.inlinkingFile.file?.basename ?? '';
	const text = `${basename} ${item.titleText} ${item.summaryMarkdown}`.toLowerCase();
	searchTextCache.set(item, text);
	return text;
}

export function filterComponentsBySearch(
	components: ExtendedInlinkingFile[],
	searchQuery: string
): ExtendedInlinkingFile[] {
	const normalizedQuery = searchQuery.toLowerCase().trim();
	if (!normalizedQuery) {
		return components;
	}

	return components.filter((item) => getSearchText(item).includes(normalizedQuery));
}

export function getLinkedMentionsCountLabel(params: {
	totalEntryCount: number;
	listLimit: number;
	renderedCount: number;
	filteredCount: number;
	hasSearch: boolean;
}): string {
	const {
		totalEntryCount,
		listLimit,
		renderedCount,
		filteredCount,
		hasSearch,
	} = params;
	const hasListLimit = listLimit > 0 && totalEntryCount > listLimit;

	if (hasSearch && hasListLimit) {
		return `${filteredCount} of ${totalEntryCount}`;
	}
	if (hasListLimit) {
		return `${renderedCount} of ${totalEntryCount}`;
	}
	if (hasSearch) {
		return `${filteredCount} of ${renderedCount}`;
	}
	return totalEntryCount.toString();
}

export function getLinkedMentionsCountTooltip(params: {
	totalEntryCount: number;
	renderedCount: number;
	filteredCount: number;
	hasSearch: boolean;
	listLimit: number;
}): string {
	const { totalEntryCount, renderedCount, filteredCount, hasSearch, listLimit } = params;
	const hasListLimit = listLimit > 0 && totalEntryCount > listLimit;

	if (hasSearch && hasListLimit) {
		return `${filteredCount} matching backlinks shown out of ${totalEntryCount} total backlinks.`;
	}
	if (hasListLimit) {
		return `${renderedCount} backlinks shown out of ${totalEntryCount} total backlinks.`;
	}
	if (hasSearch) {
		return `${filteredCount} matching backlinks out of ${renderedCount} currently loaded backlinks.`;
	}
	return `${totalEntryCount} backlinks.`;
}

export function getNoSearchResultsMessage(searchQuery: string): string {
	const query = searchQuery.trim();
	if (!query) {
		return 'No matching backlinks found.';
	}
	return `No backlinks match "${query}".`;
}

export function getLoadMoreBacklinksLabel(params: {
	visibleCount: number;
	totalFilteredCount: number;
	chunkSize: number;
}): string {
	const { visibleCount, totalFilteredCount, chunkSize } = params;
	const remaining = Math.max(0, totalFilteredCount - visibleCount);
	if (remaining === 0) {
		return 'All backlinks loaded';
	}
	const nextCount = Math.min(remaining, Math.max(1, chunkSize));
	return `Load ${nextCount} more backlinks`;
}

export function getEmptyBacklinksMessage(params: {
	totalEntryCount: number;
	renderedCount: number;
}): string {
	const { totalEntryCount, renderedCount } = params;
	if (totalEntryCount === 0) {
		return 'No backlinks found for this note yet.';
	}
	if (renderedCount === 0) {
		return 'Backlinks are currently hidden by your filters or settings.';
	}
	return '';
}

export function shouldProcessInfluxUpdateEvent(params: {
	event: InfluxUpdateEvent;
	currentPath?: string;
	affectsBacklinks: boolean;
}): boolean {
	const { event, currentPath, affectsBacklinks } = params;

	if (!currentPath) {
		return false;
	}

	if (event.op === 'layout-change' || event.op === 'file-open') {
		return false;
	}

	if (event.op === 'modify' || event.op === 'rename' || event.op === 'delete') {
		if (!event.file) {
			return false;
		}

		const touchesCurrentFile = event.file.path === currentPath;
		return touchesCurrentFile || affectsBacklinks;
	}

	return true;
}

export function makeUpdateEvent(op: string, path?: string): InfluxUpdateEvent {
	const file = path ? ({ path } as TFile) : undefined;
	return { op, file };
}

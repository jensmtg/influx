import type { ExtendedInlinkingFile } from '../domain/backlinks/types';

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
	return components.map((component) => component.inlinkingFile.file.path);
}

export interface SearchMatchDetails {
	query: string;
	matchesBasename: boolean;
	matchesTitle: boolean;
	matchesSummary: boolean;
	reasons: string[];
}

export function collectBasenameCounts(components: ExtendedInlinkingFile[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const component of components) {
		const basename = component.inlinkingFile.file.basename;
		counts.set(basename, (counts.get(basename) ?? 0) + 1);
	}
	return counts;
}

export function getSourcePathContext(filePath: string, basename: string): string {
	const suffix = `/${basename}.md`;
	if (filePath.endsWith(suffix)) {
		return filePath.slice(0, -suffix.length);
	}
	const fallbackSuffix = `/${basename}`;
	if (filePath.endsWith(fallbackSuffix)) {
		return filePath.slice(0, -fallbackSuffix.length);
	}
	return filePath;
}

export interface SearchFocusScheduler {
	(callback: () => void, delayMs: number): void;
}

export function areAllComponentPathsCollapsed(
	paths: string[],
	isCollapsed: (path: string) => boolean
): boolean {
	return paths.length > 0 && paths.every((path) => isCollapsed(path));
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
	const basename = item.inlinkingFile.file.basename;
	const text = `${basename} ${item.titleText} ${item.summaryMarkdown}`.toLowerCase();
	searchTextCache.set(item, text);
	return text;
}

export function filterComponentsBySearch(
	components: ExtendedInlinkingFile[],
	searchQuery: string
): ExtendedInlinkingFile[] {
	const normalizedQuery = normalizeSearchQuery(searchQuery);
	if (!normalizedQuery) {
		return components;
	}

	return components.filter((item) => getSearchText(item).includes(normalizedQuery));
}

export function normalizeSearchQuery(searchQuery: string): string {
	return searchQuery.toLowerCase().trim();
}

export function getSearchMatchDetails(
	item: ExtendedInlinkingFile,
	searchQuery: string
): SearchMatchDetails | null {
	const normalizedQuery = normalizeSearchQuery(searchQuery);
	if (!normalizedQuery) {
		return null;
	}

	const matchesBasename = item.inlinkingFile.file.basename.toLowerCase().includes(normalizedQuery);
	const matchesTitle = (item.titleText ?? '').toLowerCase().includes(normalizedQuery);
	const matchesSummary = (item.summaryMarkdown ?? '').toLowerCase().includes(normalizedQuery);
	const reasons: string[] = [];

	if (matchesBasename) {
		reasons.push('source note');
	}
	if (matchesTitle) {
		reasons.push('section title');
	}
	if (matchesSummary) {
		reasons.push('excerpt');
	}

	return {
		query: normalizedQuery,
		matchesBasename,
		matchesTitle,
		matchesSummary,
		reasons,
	};
}

export function splitTextBySearchQuery(
	text: string,
	searchQuery: string
): Array<{ text: string; match: boolean }> {
	const normalizedQuery = normalizeSearchQuery(searchQuery);
	if (!text || !normalizedQuery) {
		return [{ text, match: false }];
	}

	const lowerText = text.toLowerCase();
	const segments: Array<{ text: string; match: boolean }> = [];
	let cursor = 0;

	while (cursor < text.length) {
		const matchIndex = lowerText.indexOf(normalizedQuery, cursor);
		if (matchIndex === -1) {
			segments.push({ text: text.slice(cursor), match: false });
			break;
		}

		if (matchIndex > cursor) {
			segments.push({ text: text.slice(cursor, matchIndex), match: false });
		}

		segments.push({
			text: text.slice(matchIndex, matchIndex + normalizedQuery.length),
			match: true,
		});
		cursor = matchIndex + normalizedQuery.length;
	}

	return segments.length > 0 ? segments : [{ text, match: false }];
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
	return `No backlinks match "${query}" in source names, section titles, or excerpt text.`;
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

export function getNextVisibleCount(params: {
	currentVisibleCount: number;
	chunkSize: number;
	totalFilteredCount: number;
}): number {
	const { currentVisibleCount, chunkSize, totalFilteredCount } = params;
	return Math.min(currentVisibleCount + chunkSize, totalFilteredCount);
}

export function shouldAttachAutoLoadObserver(params: {
	autoLoadByObserver: boolean;
	hasMoreVisible: boolean;
	hasIntersectionObserver: boolean;
	hasTrigger: boolean;
}): boolean {
	const { autoLoadByObserver, hasMoreVisible, hasIntersectionObserver, hasTrigger } = params;
	return autoLoadByObserver && hasMoreVisible && hasIntersectionObserver && hasTrigger;
}

export function shouldLoadMoreFromObserver(entries: ArrayLike<{ isIntersecting: boolean }>): boolean {
	return Array.from(entries).some((entry) => entry.isIntersecting);
}

export function handleSearchChangeInput(params: {
	value: string;
	dispatch: (action: SearchUiAction) => void;
	commitDebouncedQuery: (value: string) => void;
}): void {
	const { value, dispatch, commitDebouncedQuery } = params;
	dispatch({ type: 'INPUT_CHANGED', value });
	commitDebouncedQuery(value);
}

export function resetSearchUi(params: {
	closePanel: boolean;
	dispatch: (action: SearchUiAction) => void;
	cancelDebouncedQuery: () => void;
}): void {
	const { closePanel, dispatch, cancelDebouncedQuery } = params;
	cancelDebouncedQuery();
	dispatch({ type: 'RESET', closePanel });
}

export function toggleSearchPanel(params: {
	isSearchExpanded: boolean;
	dispatch: (action: SearchUiAction) => void;
	scheduleFocus: SearchFocusScheduler;
	focusDelayMs: number;
	focusSearchInput: () => void;
}): void {
	const { isSearchExpanded, dispatch, scheduleFocus, focusDelayMs, focusSearchInput } = params;
	const willOpen = !isSearchExpanded;
	dispatch({ type: 'TOGGLE_PANEL' });
	if (willOpen) {
		scheduleFocus(focusSearchInput, focusDelayMs);
	}
}

export function handleSearchKeyPress(params: {
	key: string;
	resetSearch: (closePanel: boolean) => void;
}): void {
	if (params.key === 'Escape') {
		params.resetSearch(true);
	}
}


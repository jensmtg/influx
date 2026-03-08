import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';
import {
	areAllComponentPathsCollapsed,
	collectBasenameCounts,
	collectComponentPaths,
	collectInitialCollapsedPaths,
	createInitialSearchUiState,
	filterComponentsBySearch,
	getEmptyBacklinksMessage,
	getLoadMoreBacklinksLabel,
	getLinkedMentionsCountLabel,
	getLinkedMentionsCountTooltip,
	getNextVisibleCount,
	getNoSearchResultsMessage,
	getSearchText,
	getSourcePathContext,
	handleSearchChangeInput,
	handleSearchKeyPress,
	makeUpdateEvent,
	reduceSearchUiState,
	resetSearchUi,
	resolveInfluxUpdateEntries,
	shouldAttachAutoLoadObserver,
	shouldLoadMoreFromObserver,
	shouldProcessInfluxUpdateEvent,
	toggleSearchPanel,
} from '@/ui/influx-react-component-helpers';

function entry(params: {
	path: string;
	basename: string;
	titleText?: string;
	summaryMarkdown?: string;
}): ExtendedInlinkingFile {
	return {
		inlinkingFile: {
			file: {
				path: params.path,
				basename: params.basename,
			},
			isLinkInTitle: false,
		},
		titleText: params.titleText ?? '',
		summaryMarkdown: params.summaryMarkdown ?? '',
		sourcePath: params.path,
	} as unknown as ExtendedInlinkingFile;
}

describe('influx-react-component helpers', () => {
	describe('search ui state transitions', () => {
		test('toggle expands and focuses, then collapses and unfocuses', () => {
			const initial = createInitialSearchUiState();
			const opened = reduceSearchUiState(initial, { type: 'TOGGLE_PANEL' });
			expect(opened.isSearchExpanded).toBe(true);
			expect(opened.isSearchFocused).toBe(true);

			const closed = reduceSearchUiState(opened, { type: 'TOGGLE_PANEL' });
			expect(closed.isSearchExpanded).toBe(false);
			expect(closed.isSearchFocused).toBe(false);
		});

		test('input/query/reset flow preserves panel state when clearing', () => {
			const opened = reduceSearchUiState(createInitialSearchUiState(), { type: 'TOGGLE_PANEL' });
			const typed = reduceSearchUiState(opened, { type: 'INPUT_CHANGED', value: 'alpha' });
			const committed = reduceSearchUiState(typed, { type: 'QUERY_COMMITTED', value: 'alpha' });

			expect(committed.inputValue).toBe('alpha');
			expect(committed.searchQuery).toBe('alpha');
			expect(committed.isSearchExpanded).toBe(true);

			const cleared = reduceSearchUiState(committed, { type: 'RESET', closePanel: false });
			expect(cleared.inputValue).toBe('');
			expect(cleared.searchQuery).toBe('');
			expect(cleared.isSearchExpanded).toBe(true);
		});

		test('escape-equivalent reset closes panel and clears state', () => {
			const state = {
				inputValue: 'alpha',
				searchQuery: 'alpha',
				isSearchExpanded: true,
				isSearchFocused: true,
			};
			const resetClosed = reduceSearchUiState(state, { type: 'RESET', closePanel: true });
			expect(resetClosed).toEqual({
				inputValue: '',
				searchQuery: '',
				isSearchExpanded: false,
				isSearchFocused: false,
			});
		});

		test('handleSearchChangeInput updates input immediately and commits debounced query', () => {
			const dispatch = jest.fn();
			const commitDebouncedQuery = jest.fn();

			handleSearchChangeInput({
				value: 'alpha',
				dispatch,
				commitDebouncedQuery,
			});

			expect(dispatch).toHaveBeenCalledWith({ type: 'INPUT_CHANGED', value: 'alpha' });
			expect(commitDebouncedQuery).toHaveBeenCalledWith('alpha');
		});

		test('resetSearchUi cancels pending queries before resetting state', () => {
			const dispatch = jest.fn();
			const cancelDebouncedQuery = jest.fn();

			resetSearchUi({
				closePanel: true,
				dispatch,
				cancelDebouncedQuery,
			});

			expect(cancelDebouncedQuery).toHaveBeenCalledTimes(1);
			expect(dispatch).toHaveBeenCalledWith({ type: 'RESET', closePanel: true });
		});

		test('toggleSearchPanel only schedules focus when opening', () => {
			const dispatch = jest.fn();
			const scheduleFocus = jest.fn();
			const focusSearchInput = jest.fn();

			toggleSearchPanel({
				isSearchExpanded: false,
				dispatch,
				scheduleFocus,
				focusDelayMs: 100,
				focusSearchInput,
			});

			expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PANEL' });
			expect(scheduleFocus).toHaveBeenCalledWith(focusSearchInput, 100);

			dispatch.mockClear();
			scheduleFocus.mockClear();
			toggleSearchPanel({
				isSearchExpanded: true,
				dispatch,
				scheduleFocus,
				focusDelayMs: 100,
				focusSearchInput,
			});

			expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PANEL' });
			expect(scheduleFocus).not.toHaveBeenCalled();
		});

		test('handleSearchKeyPress only resets on Escape', () => {
			const resetSearch = jest.fn();

			handleSearchKeyPress({ key: 'Enter', resetSearch });
			expect(resetSearch).not.toHaveBeenCalled();

			handleSearchKeyPress({ key: 'Escape', resetSearch });
			expect(resetSearch).toHaveBeenCalledWith(true);
		});
	});

	describe('search helpers', () => {
		test('filterComponentsBySearch matches basename, title, and summary case-insensitively', () => {
			const components = [
				entry({ path: 'A.md', basename: 'Alpha', titleText: 'Project Roadmap', summaryMarkdown: 'Milestone one' }),
				entry({ path: 'B.md', basename: 'Beta', titleText: 'Scratch', summaryMarkdown: 'Contains Query Notes' }),
			];

			expect(filterComponentsBySearch(components, 'alpha')).toHaveLength(1);
			expect(filterComponentsBySearch(components, 'ROADMAP')).toHaveLength(1);
			expect(filterComponentsBySearch(components, 'query')).toHaveLength(1);
			expect(filterComponentsBySearch(components, 'missing')).toHaveLength(0);
		});

		test('filterComponentsBySearch returns original list for blank queries', () => {
			const components = [entry({ path: 'A.md', basename: 'Alpha' })];

			expect(filterComponentsBySearch(components, '')).toBe(components);
			expect(filterComponentsBySearch(components, '   ')).toBe(components);
		});

		test('getSearchText memoizes by object identity', () => {
			const component = entry({
				path: 'A.md',
				basename: 'Alpha',
				titleText: 'Heading',
				summaryMarkdown: 'Body',
			});

			const first = getSearchText(component);
			const second = getSearchText(component);

			expect(first).toBe(second);
			expect(first).toBe('alpha heading body');
		});
	});

	describe('count and collapse helpers', () => {
		test('getLinkedMentionsCountLabel returns list-limit/search combinations correctly', () => {
			expect(
				getLinkedMentionsCountLabel({
					totalEntryCount: 20,
					listLimit: 10,
					renderedCount: 10,
					filteredCount: 4,
					hasSearch: true,
				})
			).toBe('4 of 20');

			expect(
				getLinkedMentionsCountLabel({
					totalEntryCount: 20,
					listLimit: 10,
					renderedCount: 10,
					filteredCount: 10,
					hasSearch: false,
				})
			).toBe('10 of 20');

			expect(
				getLinkedMentionsCountLabel({
					totalEntryCount: 5,
					listLimit: 10,
					renderedCount: 5,
					filteredCount: 2,
					hasSearch: true,
				})
			).toBe('2 of 5');

			expect(
				getLinkedMentionsCountLabel({
					totalEntryCount: 5,
					listLimit: 10,
					renderedCount: 5,
					filteredCount: 5,
					hasSearch: false,
				})
			).toBe('5');
		});

		test('collectInitialCollapsedPaths only returns paths when collapsed default is enabled', () => {
			const components = [
				entry({ path: 'A.md', basename: 'Alpha' }),
				entry({ path: 'B.md', basename: 'Beta' }),
			];

			expect(collectComponentPaths(components)).toEqual(['A.md', 'B.md']);
			expect(collectInitialCollapsedPaths({ collapsed: true, components })).toEqual(['A.md', 'B.md']);
			expect(collectInitialCollapsedPaths({ collapsed: false, components })).toEqual([]);
		});

		test('collectBasenameCounts tracks duplicate source note names for disambiguation', () => {
			const counts = collectBasenameCounts([
				entry({ path: 'Folder/A.md', basename: 'A' }),
				entry({ path: 'Folder2/A.md', basename: 'A' }),
				entry({ path: 'Folder/B.md', basename: 'B' }),
			]);

			expect(counts.get('A')).toBe(2);
			expect(counts.get('B')).toBe(1);
		});

		test('getSourcePathContext returns folder context without the basename suffix', () => {
			expect(getSourcePathContext('Folder/Sub/Robin.md', 'Robin')).toBe('Folder/Sub');
			expect(getSourcePathContext('Folder/Sub/Robin', 'Robin')).toBe('Folder/Sub');
			expect(getSourcePathContext('Robin.md', 'Robin')).toBe('Robin.md');
		});

		test('areAllComponentPathsCollapsed reflects per-item collapse state for toolbar labels', () => {
			expect(
				areAllComponentPathsCollapsed(['A.md', 'B.md'], (path: string) => path === 'A.md' || path === 'B.md')
			).toBe(true);

			expect(
				areAllComponentPathsCollapsed(['A.md', 'B.md'], (path: string) => path === 'A.md')
			).toBe(false);

			expect(
				areAllComponentPathsCollapsed([], () => true)
			).toBe(false);
		});

		test('getLinkedMentionsCountTooltip provides explicit count context', () => {
			expect(
				getLinkedMentionsCountTooltip({
					totalEntryCount: 20,
					listLimit: 10,
					renderedCount: 10,
					filteredCount: 4,
					hasSearch: true,
				})
			).toBe('4 matching backlinks shown out of 20 total backlinks.');

			expect(
				getLinkedMentionsCountTooltip({
					totalEntryCount: 20,
					listLimit: 10,
					renderedCount: 10,
					filteredCount: 10,
					hasSearch: false,
				})
			).toBe('10 backlinks shown out of 20 total backlinks.');
		});

		test('getNoSearchResultsMessage references the user query when present', () => {
			expect(getNoSearchResultsMessage('alpha')).toBe('No backlinks match "alpha".');
			expect(getNoSearchResultsMessage('  alpha beta  ')).toBe('No backlinks match "alpha beta".');
			expect(getNoSearchResultsMessage('   ')).toBe('No matching backlinks found.');
		});

		test('getLoadMoreBacklinksLabel reflects remaining amount and chunk size', () => {
			expect(
				getLoadMoreBacklinksLabel({
					visibleCount: 40,
					totalFilteredCount: 95,
					chunkSize: 30,
				})
			).toBe('Load 30 more backlinks');

			expect(
				getLoadMoreBacklinksLabel({
					visibleCount: 80,
					totalFilteredCount: 95,
					chunkSize: 50,
				})
			).toBe('Load 15 more backlinks');

			expect(
				getLoadMoreBacklinksLabel({
					visibleCount: 10,
					totalFilteredCount: 10,
					chunkSize: 30,
				})
			).toBe('All backlinks loaded');
		});

		test('getNextVisibleCount caps appended results at the filtered total', () => {
			expect(
				getNextVisibleCount({
					currentVisibleCount: 40,
					chunkSize: 30,
					totalFilteredCount: 95,
				})
			).toBe(70);

			expect(
				getNextVisibleCount({
					currentVisibleCount: 80,
					chunkSize: 50,
					totalFilteredCount: 95,
				})
			).toBe(95);
		});

		test('shouldAttachAutoLoadObserver only enables observer when all prerequisites are present', () => {
			expect(
				shouldAttachAutoLoadObserver({
					autoLoadByObserver: true,
					hasMoreVisible: true,
					hasIntersectionObserver: true,
					hasTrigger: true,
				})
			).toBe(true);

			expect(
				shouldAttachAutoLoadObserver({
					autoLoadByObserver: false,
					hasMoreVisible: true,
					hasIntersectionObserver: true,
					hasTrigger: true,
				})
			).toBe(false);

			expect(
				shouldAttachAutoLoadObserver({
					autoLoadByObserver: true,
					hasMoreVisible: false,
					hasIntersectionObserver: true,
					hasTrigger: true,
				})
			).toBe(false);
		});

		test('shouldLoadMoreFromObserver triggers when any observed entry intersects', () => {
			expect(
				shouldLoadMoreFromObserver([
					{ isIntersecting: false },
					{ isIntersecting: true },
				])
			).toBe(true);

			expect(
				shouldLoadMoreFromObserver([
					{ isIntersecting: false },
					{ isIntersecting: false },
				])
			).toBe(false);
		});

		test('getEmptyBacklinksMessage explains empty and filtered states', () => {
			expect(getEmptyBacklinksMessage({ totalEntryCount: 0, renderedCount: 0 })).toBe(
				'No backlinks found for this note yet.'
			);
			expect(getEmptyBacklinksMessage({ totalEntryCount: 8, renderedCount: 0 })).toBe(
				'Backlinks are currently hidden by your filters or settings.'
			);
			expect(getEmptyBacklinksMessage({ totalEntryCount: 8, renderedCount: 3 })).toBe('');
		});
	});

	describe('update-event gating', () => {
		test('shouldProcessInfluxUpdateEvent ignores layout/file-open and missing current path', () => {
			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('layout-change'),
					currentPath: 'Current.md',
					affectsBacklinks: true,
				})
			).toBe(false);

			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('file-open'),
					currentPath: 'Current.md',
					affectsBacklinks: true,
				})
			).toBe(false);

			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('modify', 'Other.md'),
					currentPath: undefined,
					affectsBacklinks: true,
				})
			).toBe(false);
		});

		test('shouldProcessInfluxUpdateEvent requires file for modify/rename/delete and checks relevance', () => {
			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('modify'),
					currentPath: 'Current.md',
					affectsBacklinks: false,
				})
			).toBe(false);

			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('modify', 'Current.md'),
					currentPath: 'Current.md',
					affectsBacklinks: false,
				})
			).toBe(true);

			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('rename', 'Other.md'),
					currentPath: 'Current.md',
					affectsBacklinks: true,
				})
			).toBe(true);

			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('delete', 'Other.md'),
					currentPath: 'Current.md',
					affectsBacklinks: false,
				})
			).toBe(false);
		});

		test('shouldProcessInfluxUpdateEvent allows non-file operations by default', () => {
			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('save-settings'),
					currentPath: 'Current.md',
					affectsBacklinks: false,
				})
			).toBe(true);
		});

		test('resolveInfluxUpdateEntries returns fresh entries for relevant updates', async () => {
			const entries = [entry({ path: 'Source.md', basename: 'Source' })];
			const current = {
				file: { path: 'Current.md' },
				shouldUpdate: jest.fn().mockReturnValue(false),
				makeInfluxList: jest.fn().mockResolvedValue(undefined),
				toEntries: jest.fn().mockReturnValue(entries),
			};

			const result = await resolveInfluxUpdateEntries({
				event: makeUpdateEvent('modify', 'Current.md'),
				current,
				seq: 1,
				getLatestSeq: () => 1,
				isAborted: () => false,
			});

			expect(current.makeInfluxList).toHaveBeenCalledTimes(1);
			expect(result).toBe(entries);
		});

		test('resolveInfluxUpdateEntries drops stale async results after a newer update wins', async () => {
			let release: (() => void) | null = null;
			let latestSeq = 1;
			const current = {
				file: { path: 'Current.md' },
				shouldUpdate: jest.fn().mockReturnValue(true),
				makeInfluxList: jest.fn().mockImplementation(
					() =>
						new Promise<void>((resolve) => {
							release = resolve;
						})
				),
				toEntries: jest.fn().mockReturnValue([entry({ path: 'Source.md', basename: 'Source' })]),
			};

			const pending = resolveInfluxUpdateEntries({
				event: makeUpdateEvent('rename', 'Other.md'),
				current,
				seq: 1,
				getLatestSeq: () => latestSeq,
				isAborted: () => false,
			});

			latestSeq = 2;
			release?.();
			await expect(pending).resolves.toBeNull();
			expect(current.toEntries).not.toHaveBeenCalled();
		});

		test('resolveInfluxUpdateEntries stops after abort and does not read entries', async () => {
			const current = {
				file: { path: 'Current.md' },
				shouldUpdate: jest.fn().mockReturnValue(true),
				makeInfluxList: jest.fn().mockResolvedValue(undefined),
				toEntries: jest.fn(),
			};
			let aborted = false;

			const pending = resolveInfluxUpdateEntries({
				event: makeUpdateEvent('delete', 'Other.md'),
				current,
				seq: 1,
				getLatestSeq: () => 1,
				isAborted: () => aborted,
			});

			aborted = true;
			await expect(pending).resolves.toBeNull();
			expect(current.toEntries).not.toHaveBeenCalled();
		});
	});
});

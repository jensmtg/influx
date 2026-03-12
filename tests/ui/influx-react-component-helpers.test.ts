import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';
import { InlinkingFile, type InlinkingFileApi } from '@/domain/backlinks/inlinking-file';
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
	getSearchMatchDetails,
	getNextVisibleCount,
	getNoSearchResultsMessage,
	normalizeSearchQuery,
	getSearchText,
	getSourcePathContext,
	handleSearchChangeInput,
	handleSearchKeyPress,
	reduceSearchUiState,
	resetSearchUi,
	shouldAttachAutoLoadObserver,
	shouldLoadMoreFromObserver,
	splitTextBySearchQuery,
	toggleSearchPanel,
} from '@/ui/influx-react-component-helpers';
import {
	makeUpdateEvent,
	resolveInfluxUpdateEntries,
	shouldProcessInfluxUpdateEvent,
} from '@/ui/influx-update-helpers';
import { mockTFile } from '../mocks';

function createInlinkingApi(): jest.Mocked<InlinkingFileApi> {
	return {
		getMetadata: jest.fn().mockReturnValue(null),
		readFile: jest.fn(),
		compareLinkName: jest.fn(),
	};
}

function entry(params: {
	path: string;
	basename: string;
	titleText?: string;
	summaryMarkdown?: string;
}): ExtendedInlinkingFile {
	const inlinkingFile = new InlinkingFile(mockTFile(params.path, params.basename), createInlinkingApi());
	return {
		inlinkingFile,
		titleText: params.titleText ?? '',
		summaryMarkdown: params.summaryMarkdown ?? '',
		sourcePath: params.path,
	};
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

		test('toggleSearchPanel clears pending focus and only schedules a new one when opening', () => {
			const dispatch = jest.fn();
			const cancelScheduledFocus = jest.fn();
			const scheduleFocus = jest.fn();
			const focusSearchInput = jest.fn();

			toggleSearchPanel({
				isSearchExpanded: false,
				dispatch,
				cancelScheduledFocus,
				scheduleFocus,
				focusDelayMs: 100,
				focusSearchInput,
			});

			expect(cancelScheduledFocus).toHaveBeenCalledTimes(1);
			expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PANEL' });
			expect(scheduleFocus).toHaveBeenCalledWith(focusSearchInput, 100);

			cancelScheduledFocus.mockClear();
			dispatch.mockClear();
			scheduleFocus.mockClear();
			toggleSearchPanel({
				isSearchExpanded: true,
				dispatch,
				cancelScheduledFocus,
				scheduleFocus,
				focusDelayMs: 100,
				focusSearchInput,
			});

			expect(cancelScheduledFocus).toHaveBeenCalledTimes(1);
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
		test('normalizeSearchQuery lowercases and trims user input', () => {
			expect(normalizeSearchQuery('  ALpha Beta  ')).toBe('alpha beta');
		});

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

		test('getSearchMatchDetails explains where the query matched', () => {
			const component = entry({
				path: 'A.md',
				basename: 'Alpha',
				titleText: 'Project Alpha',
				summaryMarkdown: 'Notes about alpha rollout',
			});

			expect(getSearchMatchDetails(component, 'alpha')).toEqual({
				query: 'alpha',
				matchesBasename: true,
				matchesTitle: true,
				matchesSummary: true,
				reasons: ['source note', 'section title', 'excerpt'],
			});
			expect(getSearchMatchDetails(component, '   ')).toBeNull();
		});

		test('splitTextBySearchQuery preserves text and marks all matching segments', () => {
			expect(splitTextBySearchQuery('Alpha beta beta', 'beta')).toEqual([
				{ text: 'Alpha ', match: false },
				{ text: 'beta', match: true },
				{ text: ' ', match: false },
				{ text: 'beta', match: true },
			]);
			expect(splitTextBySearchQuery('Alpha', '   ')).toEqual([{ text: 'Alpha', match: false }]);
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
					event: makeUpdateEvent('modify', 'Other.md'),
					currentPath: 'Current.md',
					affectsBacklinks: true,
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

		test('rename updates stay relevant when oldPath or backlinks still point at the pre-rename source', () => {
			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('rename', 'Renamed.md', 'Current.md'),
					currentPath: 'Current.md',
					affectsBacklinks: false,
				})
			).toBe(true);

			expect(
				shouldProcessInfluxUpdateEvent({
					event: makeUpdateEvent('rename', 'Renamed.md', 'Elsewhere.md'),
					currentPath: 'Current.md',
					affectsBacklinks: true,
				})
			).toBe(true);
		});

		test('resolveInfluxUpdateEntries uses oldPath-aware backlink relevance for rename events', async () => {
			const entries = [entry({ path: 'Source.md', basename: 'Source' })];
			const current = {
				file: { path: 'Current.md' },
				shouldUpdate: jest.fn().mockReturnValue(false),
				shouldUpdatePaths: jest.fn().mockReturnValue(true),
				makeInfluxList: jest.fn().mockResolvedValue(undefined),
				toEntries: jest.fn().mockReturnValue(entries),
			};

			const result = await resolveInfluxUpdateEntries({
				event: makeUpdateEvent('rename', 'Renamed.md', 'Source.md'),
				current,
				seq: 1,
				getLatestSeq: () => 1,
				isAborted: () => false,
			});

			expect(current.shouldUpdatePaths).toHaveBeenCalledWith(['Renamed.md', 'Source.md']);
			expect(current.shouldUpdate).not.toHaveBeenCalled();
			expect(current.makeInfluxList).toHaveBeenCalledTimes(1);
			expect(result).toBe(entries);
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

		test('resolveInfluxUpdateEntries refreshes visibility and returns empty entries when the note becomes hidden', async () => {
			const current = {
				file: { path: 'Current.md' },
				show: true,
				shouldUpdate: jest.fn().mockReturnValue(false),
				refreshVisibility: jest.fn(function (this: { show: boolean }) {
					this.show = false;
					return this.show;
				}),
				makeInfluxList: jest.fn(),
				toEntries: jest.fn(),
			};

			const result = await resolveInfluxUpdateEntries({
				event: makeUpdateEvent('save-settings'),
				current,
				seq: 1,
				getLatestSeq: () => 1,
				isAborted: () => false,
			});

			expect(current.refreshVisibility).toHaveBeenCalledTimes(1);
			expect(current.makeInfluxList).not.toHaveBeenCalled();
			expect(current.toEntries).not.toHaveBeenCalled();
			expect(result).toEqual([]);
		});

			test('resolveInfluxUpdateEntries drops stale async results after a newer update wins', async () => {
				let release!: () => void;
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
				release();
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

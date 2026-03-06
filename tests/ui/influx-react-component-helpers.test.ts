import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';
import {
	collectComponentPaths,
	collectInitialCollapsedPaths,
	filterComponentsBySearch,
	getEmptyBacklinksMessage,
	getLoadMoreBacklinksLabel,
	getLinkedMentionsCountLabel,
	getLinkedMentionsCountTooltip,
	getNoSearchResultsMessage,
	getSearchText,
	makeUpdateEvent,
	shouldProcessInfluxUpdateEvent,
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
	});
});

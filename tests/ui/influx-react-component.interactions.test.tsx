/** @jest-environment jsdom */

import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import InfluxReactComponent from '@/ui/influx-react-component';
import { influxUpdates$ } from '@/platform/events/influx-updates';
import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';
import InfluxFile, { type InfluxFileApi } from '@/domain/backlinks/influx-file';
import { InlinkingFile, type InlinkingFileApi } from '@/domain/backlinks/inlinking-file';
import { DEFAULT_SETTINGS } from '@/types';
import { mockTFile } from '../mocks';

function makeBacklinks(paths: string[]) {
	return {
		data: new Map(paths.map((path) => [path, [{ link: path }]])),
	};
}

jest.mock('@/ui/markdown-mount', () => ({
	__esModule: true,
	default: (props: { markdown: string; sourcePath: string; className?: string }) => (
		<div className={props.className} data-testid="markdown-mount" data-source-path={props.sourcePath}>
			{props.markdown}
		</div>
	),
}));

jest.mock('@/platform/diagnostics/metrics', () => ({
	recordMetric: jest.fn(),
}));

jest.mock('@/platform/events/influx-updates', () => ({
	influxUpdates$: {
		subscribe: jest.fn(),
	},
}));

type ComponentProps = React.ComponentProps<typeof InfluxReactComponent>;
type ComponentPlugin = ComponentProps['plugin'];

function createInlinkingApi(): jest.Mocked<InlinkingFileApi> {
	return {
		getMetadata: jest.fn().mockReturnValue(null),
		readFile: jest.fn(),
		compareLinkName: jest.fn(),
	};
}

function makeComponent(index: number, label?: string): ExtendedInlinkingFile {
	const basename = label ?? `Source-${index}`;
	const path = `Folder/${basename}.md`;
	const inlinkingFile = new InlinkingFile(mockTFile(path, basename), createInlinkingApi());
	return {
		inlinkingFile,
		titleText: `Title ${basename}`,
		summaryMarkdown: `Summary ${basename}`,
		sourcePath: path,
	};
}

function makePlugin(): ComponentPlugin {
	return {
		data: { settings: DEFAULT_SETTINGS },
		cycleListLimit: jest.fn(),
		toggleFrontmatterLinks: jest.fn(),
		toggleSortOrder: jest.fn(),
	};
}

function createInfluxApi(): jest.Mocked<InfluxFileApi> {
	return {
		getFileByPath: jest.fn((path: string) => mockTFile(path, path.split('/').pop()?.replace(/\.md$/, '') ?? 'Target')),
		getMetadata: jest.fn().mockReturnValue(null),
		getBacklinks: jest.fn().mockReturnValue({ data: new Map() }),
		getShowStatus: jest.fn().mockReturnValue(true),
		getCollapsedStatus: jest.fn().mockReturnValue(false),
		isIncludableSource: jest.fn().mockReturnValue(true),
		getSettings: jest.fn().mockReturnValue({
			...DEFAULT_SETTINGS,
			showInfluxInSidebar: false,
			variant: 'CENTER_ALIGNED',
			fontSize: 13,
			listLimit: 0,
			entryHeaderVisible: true,
			includeFrontmatterLinks: true,
		}),
		readFile: jest.fn(),
		compareLinkName: jest.fn(),
	};
}

async function makeInfluxFile(params: {
	uuid?: string;
	components: ExtendedInlinkingFile[];
	totalEntryCount: number;
	show?: boolean;
	shouldUpdate?: (file: { path: string }) => boolean;
	makeInfluxList?: () => Promise<void>;
	toEntries?: () => ExtendedInlinkingFile[];
}): Promise<ComponentProps['influxFile']> {
	const influxFile = await InfluxFile.create('Target.md', createInfluxApi());
	influxFile.uuid = params.uuid ?? 'test-uuid';
	influxFile.show = params.show ?? true;
	influxFile.collapsed = false;
	influxFile.components = params.components;
	influxFile.totalEntryCount = params.totalEntryCount;
	jest.spyOn(influxFile, 'makeInfluxList').mockImplementation(params.makeInfluxList ?? (async (): Promise<void> => undefined));
	jest.spyOn(influxFile, 'toEntries').mockImplementation(params.toEntries ?? (() => params.components));
	jest.spyOn(influxFile, 'shouldUpdate').mockImplementation(params.shouldUpdate ?? (() => false));
	return influxFile;
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('InfluxReactComponent mounted interactions', () => {
	let observerCallback: ((event: { op: string; file?: { path: string } }) => Promise<void>) | undefined;
	let unsubscribe: jest.Mock;

	beforeEach(() => {
		observerCallback = undefined;
		unsubscribe = jest.fn();
		(influxUpdates$.subscribe as jest.Mock).mockReset().mockImplementation((_id, observer) => {
			observerCallback = observer;
			return unsubscribe;
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('rerenders from live influxUpdates$ events and unsubscribes on unmount', async () => {
		let currentComponents = [makeComponent(1, 'Alpha')];
		const influxFile = await makeInfluxFile({
			components: currentComponents,
			totalEntryCount: 1,
			shouldUpdate: () => true,
			makeInfluxList: async () => {
				currentComponents = [makeComponent(2, 'Beta')];
			},
			toEntries: () => currentComponents,
		});

		const view = render(
			<InfluxReactComponent
				influxFile={influxFile}
				preview={false}
				plugin={makePlugin()}
			/>
		);

		expect(screen.getByText('Summary Alpha')).toBeTruthy();
		expect((influxUpdates$.subscribe as jest.Mock).mock.calls.map(([id]) => id)).toContain('test-uuid');

		await act(async () => {
			await observerCallback?.({ op: 'rename', file: { path: 'Elsewhere.md' } });
		});

		expect(screen.getByText('Summary Beta')).toBeTruthy();
		expect(screen.queryByText('Summary Alpha')).toBeNull();

		view.unmount();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	test('ignores stale async update results when a newer update finishes later', async () => {
		const staleDeferred = createDeferred();
		const latestDeferred = createDeferred();
		let currentComponents = [makeComponent(1, 'Initial')];
		let callCount = 0;
		const influxFile = await makeInfluxFile({
			components: currentComponents,
			totalEntryCount: 1,
			shouldUpdate: () => true,
			makeInfluxList: async () => {
				callCount += 1;
				if (callCount === 1) {
					await staleDeferred.promise;
					currentComponents = [makeComponent(2, 'Stale')];
					return;
				}
				await latestDeferred.promise;
				currentComponents = [makeComponent(3, 'Latest')];
			},
			toEntries: () => currentComponents,
		});

		render(
			<InfluxReactComponent
				influxFile={influxFile}
				preview={false}
				plugin={makePlugin()}
			/>
		);

		const staleUpdate = observerCallback?.({ op: 'modify', file: { path: 'Elsewhere.md' } });
		const latestUpdate = observerCallback?.({ op: 'rename', file: { path: 'Elsewhere.md' } });

		await act(async () => {
			latestDeferred.resolve();
			await latestUpdate;
		});

		expect(screen.getByText('Summary Latest')).toBeTruthy();

		await act(async () => {
			staleDeferred.resolve();
			await staleUpdate;
		});

		expect(screen.getByText('Summary Latest')).toBeTruthy();
		expect(screen.queryByText('Summary Stale')).toBeNull();
	});

	test('refreshes on delete events even when shouldUpdate no longer matches the removed source path', async () => {
		let currentComponents = [makeComponent(1, 'Alpha')];
		const influxFile = await makeInfluxFile({
			components: currentComponents,
			totalEntryCount: 1,
			shouldUpdate: () => false,
			makeInfluxList: async () => {
				currentComponents = [makeComponent(2, 'Beta')];
			},
			toEntries: () => currentComponents,
		});

		render(
			<InfluxReactComponent
				influxFile={influxFile}
				preview={false}
				plugin={makePlugin()}
			/>
		);

		await act(async () => {
			await observerCallback?.({ op: 'delete', file: { path: 'Removed.md' } });
		});

		expect(screen.getByText('Summary Beta')).toBeTruthy();
		expect(screen.queryByText('Summary Alpha')).toBeNull();
	});

	test('modify events propagate backlink disappearance and reappearance after source edits', async () => {
		const sourcePath = 'Folder/Source.md';
		const api = createInfluxApi();
		api.getBacklinks.mockReturnValue(makeBacklinks([sourcePath]));

		const influxFile = await InfluxFile.create('Target.md', api);
		influxFile.uuid = 'test-uuid';
		influxFile.show = true;
		influxFile.collapsed = false;
		influxFile.backlinks = makeBacklinks([sourcePath]);

		let hasBacklink = true;
		let currentComponents = [makeComponent(1, 'Source')];
		influxFile.components = currentComponents;
		influxFile.totalEntryCount = 1;

		jest.spyOn(influxFile, 'makeInfluxList').mockImplementation(async () => {
			influxFile.backlinks = hasBacklink ? makeBacklinks([sourcePath]) : makeBacklinks([]);
			currentComponents = hasBacklink ? [makeComponent(1, 'Source')] : [];
			influxFile.totalEntryCount = currentComponents.length;
		});
		jest.spyOn(influxFile, 'toEntries').mockImplementation(() => {
			influxFile.components = currentComponents;
			return currentComponents;
		});

		render(
			<InfluxReactComponent
				influxFile={influxFile}
				preview={false}
				plugin={makePlugin()}
			/>
		);

		expect(screen.getByText('Summary Source')).toBeTruthy();

		hasBacklink = false;
		api.getBacklinks.mockReturnValue(makeBacklinks([]));
		await act(async () => {
			await observerCallback?.({ op: 'modify', file: { path: sourcePath } });
		});

		expect(screen.queryByText('Summary Source')).toBeNull();
		expect(screen.getByText('No backlinks found for this note yet.')).toBeTruthy();

		hasBacklink = true;
		api.getBacklinks.mockReturnValue(makeBacklinks([sourcePath]));
		await act(async () => {
			await observerCallback?.({ op: 'modify', file: { path: sourcePath } });
		});

		expect(screen.queryByText('No backlinks found for this note yet.')).toBeNull();
		expect(screen.getByText('Summary Source')).toBeTruthy();
	});

	test('filters via debounced search, clears results, and closes on escape', async () => {
		jest.useFakeTimers();
		const influxFile = await makeInfluxFile({
			components: [makeComponent(1, 'Alpha'), makeComponent(2, 'Beta')],
			totalEntryCount: 2,
		});

		render(
			<InfluxReactComponent
				influxFile={influxFile}
				preview={false}
				plugin={makePlugin()}
			/>
		);

		fireEvent.click(screen.getByLabelText('Search backlinks'));
		await act(async () => {
			jest.advanceTimersByTime(100);
		});

		const input = screen.getByLabelText('Search backlinks') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'beta' } });

		expect(screen.getByText('Summary Alpha')).toBeTruthy();
		await act(async () => {
			jest.advanceTimersByTime(400);
		});

		expect(screen.getAllByText('Beta', { selector: 'mark' }).length).toBeGreaterThan(0);
		expect(screen.queryByText('Summary Alpha')).toBeNull();
		expect(screen.getByText('Summary Beta')).toBeTruthy();

		fireEvent.click(screen.getByLabelText('Clear search'));
		expect((screen.getByLabelText('Search backlinks') as HTMLInputElement).value).toBe('');
		expect(screen.getByText('Summary Alpha')).toBeTruthy();
		expect(screen.getByText('Summary Beta')).toBeTruthy();

		fireEvent.keyDown(screen.getByLabelText('Search backlinks'), { key: 'Escape' });
		expect(screen.queryByPlaceholderText('Search backlinks...')).toBeNull();
	});

	test('loads more editor results when the load-more button is clicked', async () => {
		const influxFile = await makeInfluxFile({
			components: Array.from({ length: 45 }, (_, index) => makeComponent(index + 1)),
			totalEntryCount: 45,
		});

		render(
			<InfluxReactComponent
				influxFile={influxFile}
				preview={false}
				plugin={makePlugin()}
			/>
		);

		expect(screen.getAllByTestId('markdown-mount')).toHaveLength(40);
		fireEvent.click(screen.getByRole('button', { name: /Load .* more backlinks/ }));
		expect(screen.getAllByTestId('markdown-mount')).toHaveLength(45);
		expect(screen.queryByRole('button', { name: /Load .* more backlinks/ })).toBeNull();
	});
});

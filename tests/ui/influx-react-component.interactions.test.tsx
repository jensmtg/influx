/** @jest-environment jsdom */

import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import InfluxReactComponent from '@/ui/influx-react-component';
import { influxUpdates$ } from '@/app/events/influx-updates';
import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';

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

jest.mock('@/app/events/influx-updates', () => ({
	influxUpdates$: {
		subscribe: jest.fn(),
	},
}));

function makeComponent(index: number, label?: string): ExtendedInlinkingFile {
	const basename = label ?? `Source-${index}`;
	const path = `Folder/${basename}.md`;
	return {
		inlinkingFile: {
			file: {
				path,
				basename,
			},
			isLinkInTitle: false,
		},
		titleText: `Title ${basename}`,
		summaryMarkdown: `Summary ${basename}`,
		sourcePath: path,
	} as unknown as ExtendedInlinkingFile;
}

function makePlugin() {
	return {
		cycleListLimit: jest.fn(),
		toggleFrontmatterLinks: jest.fn(),
		toggleSortOrder: jest.fn(),
	};
}

function makeInfluxFile(params: {
	uuid?: string;
	components: ExtendedInlinkingFile[];
	totalEntryCount: number;
	show?: boolean;
	shouldUpdate?: (file: { path: string }) => boolean;
	makeInfluxList?: () => Promise<void>;
	toEntries?: () => ExtendedInlinkingFile[];
}) {
	return {
		uuid: params.uuid ?? 'test-uuid',
		file: { path: 'Target.md' },
		show: params.show ?? true,
		collapsed: false,
		components: params.components,
		totalEntryCount: params.totalEntryCount,
		api: {
			getSettings: () => ({
				showInfluxInSidebar: false,
				variant: 'CENTER_ALIGNED',
				fontSize: 13,
				listLimit: 0,
				entryHeaderVisible: true,
				includeFrontmatterLinks: true,
			}),
		},
		makeInfluxList: jest.fn(params.makeInfluxList ?? (async (): Promise<void> => undefined)),
		toEntries: jest.fn(params.toEntries ?? (() => params.components)),
		shouldUpdate: jest.fn(params.shouldUpdate ?? (() => false)),
	};
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
		const influxFile = makeInfluxFile({
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
				influxFile={influxFile as unknown as React.ComponentProps<typeof InfluxReactComponent>['influxFile']}
				preview={false}
				plugin={makePlugin() as unknown as React.ComponentProps<typeof InfluxReactComponent>['plugin']}
			/>
		);

		expect(screen.getByText('Summary Alpha')).toBeTruthy();
		expect(influxUpdates$.subscribe).toHaveBeenCalledWith('test-uuid', expect.any(Function));

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
		const influxFile = makeInfluxFile({
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
				influxFile={influxFile as unknown as React.ComponentProps<typeof InfluxReactComponent>['influxFile']}
				preview={false}
				plugin={makePlugin() as unknown as React.ComponentProps<typeof InfluxReactComponent>['plugin']}
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

	test('filters via debounced search, clears results, and closes on escape', async () => {
		jest.useFakeTimers();
		const influxFile = makeInfluxFile({
			components: [makeComponent(1, 'Alpha'), makeComponent(2, 'Beta')],
			totalEntryCount: 2,
		});

		render(
			<InfluxReactComponent
				influxFile={influxFile as unknown as React.ComponentProps<typeof InfluxReactComponent>['influxFile']}
				preview={false}
				plugin={makePlugin() as unknown as React.ComponentProps<typeof InfluxReactComponent>['plugin']}
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

		expect(screen.queryByText('Summary Alpha')).toBeNull();
		expect(screen.getByText('Summary Beta')).toBeTruthy();

		fireEvent.click(screen.getByLabelText('Clear search'));
		expect((screen.getByLabelText('Search backlinks') as HTMLInputElement).value).toBe('');
		expect(screen.getByText('Summary Alpha')).toBeTruthy();
		expect(screen.getByText('Summary Beta')).toBeTruthy();

		fireEvent.keyDown(screen.getByLabelText('Search backlinks'), { key: 'Escape' });
		expect(screen.queryByPlaceholderText('Search backlinks...')).toBeNull();
	});

	test('loads more editor results when the load-more button is clicked', () => {
		const influxFile = makeInfluxFile({
			components: Array.from({ length: 45 }, (_, index) => makeComponent(index + 1)),
			totalEntryCount: 45,
		});

		render(
			<InfluxReactComponent
				influxFile={influxFile as unknown as React.ComponentProps<typeof InfluxReactComponent>['influxFile']}
				preview={false}
				plugin={makePlugin() as unknown as React.ComponentProps<typeof InfluxReactComponent>['plugin']}
			/>
		);

		expect(screen.getAllByTestId('markdown-mount')).toHaveLength(40);
		fireEvent.click(screen.getByText('Load 5 more backlinks'));
		expect(screen.getAllByTestId('markdown-mount')).toHaveLength(45);
		expect(screen.queryByText('Load 5 more backlinks')).toBeNull();
	});
});

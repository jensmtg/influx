/** @jest-environment jsdom */

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import InfluxReactComponent from '@/ui/influx-react-component';
import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';
import InfluxFile, { type InfluxFileApi } from '@/domain/backlinks/influx-file';
import { InlinkingFile, type InlinkingFileApi } from '@/domain/backlinks/inlinking-file';
import { DEFAULT_SETTINGS } from '@/types';
import { mockTFile } from '../mocks';

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

type ComponentProps = React.ComponentProps<typeof InfluxReactComponent>;
type ComponentPlugin = ComponentProps['plugin'];

function createInlinkingApi(): jest.Mocked<InlinkingFileApi> {
	return {
		getMetadata: jest.fn().mockReturnValue(null),
		readFile: jest.fn(),
		compareLinkName: jest.fn(),
	};
}

function makeComponent(index: number): ExtendedInlinkingFile {
	const path = `Folder/Source-${index}.md`;
	const inlinkingFile = new InlinkingFile(mockTFile(path, `Source-${index}`), createInlinkingApi());
	return {
		inlinkingFile,
		titleText: `Title ${index}`,
		summaryMarkdown: `Summary ${index}`,
		sourcePath: path,
	};
}

function createInfluxApi(settings?: Record<string, unknown>): jest.Mocked<InfluxFileApi> {
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
			sortingPrinciple: 'NEWEST_FIRST',
			entryHeaderVisible: true,
			includeFrontmatterLinks: true,
			...settings,
		}),
		readFile: jest.fn(),
		compareLinkName: jest.fn(),
	};
}

async function makeInfluxFile(params: {
	components: ExtendedInlinkingFile[];
	totalEntryCount: number;
	show?: boolean;
	settings?: Record<string, unknown>;
}): Promise<ComponentProps['influxFile']> {
	const api = createInfluxApi(params.settings);
	const influxFile = await InfluxFile.create('Target.md', api);
	influxFile.uuid = 'test-uuid';
	influxFile.show = params.show ?? true;
	influxFile.collapsed = false;
	influxFile.components = params.components;
	influxFile.totalEntryCount = params.totalEntryCount;
	jest.spyOn(influxFile, 'makeInfluxList').mockResolvedValue(undefined);
	jest.spyOn(influxFile, 'toEntries').mockReturnValue(params.components);
	jest.spyOn(influxFile, 'shouldUpdate').mockReturnValue(false);
	return influxFile;
}

function makePlugin(): ComponentPlugin {
	return {
		data: { settings: DEFAULT_SETTINGS },
		cycleListLimit: jest.fn(),
		toggleFrontmatterLinks: jest.fn(),
		toggleSortOrder: jest.fn(),
	};
}

describe('InfluxReactComponent render wiring', () => {
	test('renders empty-state message and toolbar actions when there are no visible components', async () => {
		const influxFile = await makeInfluxFile({ components: [], totalEntryCount: 0 });
		const props = {
			influxFile,
			preview: false,
			plugin: makePlugin(),
		} satisfies ComponentProps;

		render(<InfluxReactComponent {...props} />);

		expect(screen.getByText('No backlinks found for this note yet.')).toBeTruthy();
		expect(screen.getByText('Linked mentions (influx)')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Search backlinks' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Collapse all linked mentions' })).toBeTruthy();
	});

	test('renders editor load-more button label with exact remaining count', async () => {
		const components = Array.from({ length: 45 }, (_, i) => makeComponent(i + 1));
		const influxFile = await makeInfluxFile({ components, totalEntryCount: 45 });
		const props = {
			influxFile,
			preview: false,
			plugin: makePlugin(),
		} satisfies ComponentProps;

		render(<InfluxReactComponent {...props} />);

		expect(screen.getByRole('button', { name: 'Load 5 more backlinks' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Collapse Source-1' })).toBeTruthy();
	});

	test('renders source links with full file paths and folder context when basenames collide', async () => {
		const duplicateA = makeComponent(1);
		const duplicateBBase = makeComponent(2);
		duplicateBBase.inlinkingFile.file = mockTFile('Elsewhere/Source-1.md', 'Source-1');
		const duplicateB: ExtendedInlinkingFile = {
			...duplicateBBase,
			sourcePath: 'Elsewhere/Source-1.md',
		};
		const influxFile = await makeInfluxFile({ components: [duplicateA, duplicateB], totalEntryCount: 2 });
		const props = {
			influxFile,
			preview: false,
			plugin: makePlugin(),
		} satisfies ComponentProps;

		const { container } = render(<InfluxReactComponent {...props} />);
		const folderLink = container.querySelector('a[data-href="Folder/Source-1.md"]');
		const elsewhereLink = container.querySelector('a[href="Elsewhere/Source-1.md"]');

		expect(folderLink).toBeTruthy();
		expect(elsewhereLink).toBeTruthy();
		expect(screen.getByText('Folder')).toBeTruthy();
		expect(screen.getByText('Elsewhere')).toBeTruthy();
		expect(elsewhereLink?.getAttribute('target')).toBeNull();
	});

});

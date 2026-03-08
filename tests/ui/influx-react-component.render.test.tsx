import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfluxReactComponent from '@/ui/influx-react-component';
import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';
import InfluxFile, { type InfluxFileApi } from '@/domain/backlinks/influx-file';
import { InlinkingFile, type InlinkingFileApi } from '@/domain/backlinks/inlinking-file';
import { DEFAULT_SETTINGS } from '@/types';
import { mockTFile } from '../mocks';

jest.mock('@/ui/markdown-mount', () => ({
	__esModule: true,
	default: (props: { markdown: string; sourcePath: string; className?: string }) => (
		<div className={props.className} data-source-path={props.sourcePath}>
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
	test('renders empty-state message when show=true and there are no visible components', async () => {
		const influxFile = await makeInfluxFile({ components: [], totalEntryCount: 0 });
		const props = {
			influxFile,
			preview: false,
			plugin: makePlugin(),
		} satisfies ComponentProps;
		const html = renderToStaticMarkup(
			<InfluxReactComponent {...props} />
		);

		expect(html).toContain('No backlinks found for this note yet.');
		expect(html).toContain('Linked mentions');
		expect(html).toContain('<button');
		expect(html).toContain('Search backlinks');
		expect(html).toContain('Collapse all linked mentions');
		expect(html).not.toContain('title="Search backlinks"');
	});

	test('renders editor load-more button label with exact remaining count', async () => {
		const components = Array.from({ length: 45 }, (_, i) => makeComponent(i + 1));
		const influxFile = await makeInfluxFile({ components, totalEntryCount: 45 });
		const props = {
			influxFile,
			preview: false,
			plugin: makePlugin(),
		} satisfies ComponentProps;

		const html = renderToStaticMarkup(
			<InfluxReactComponent {...props} />
		);

		expect(html).toContain('Load 5 more backlinks');
		expect(html).toContain('Collapse Source-1');
	});

	test('uses influx-prefixed structural classes for editor layout', async () => {
		const components = [makeComponent(1)];
		const influxFile = await makeInfluxFile({ components, totalEntryCount: 1 });
		const props = {
			influxFile,
			preview: false,
			plugin: makePlugin(),
		} satisfies ComponentProps;

		const html = renderToStaticMarkup(<InfluxReactComponent {...props} />);

		expect(html).toContain('influx-toolbar');
		expect(html).toContain('influx-summary-row--toolbar');
		expect(html).toContain('influx-result-group');
		expect(html).toContain('influx-result-body');
		expect(html).toContain('influx-svg-icon');
		expect(html).not.toContain('nav-header');
		expect(html).not.toContain('tree-item-self');
		expect(html).not.toContain('search-result-file-matches');
		expect(html).not.toContain('svg-icon lucide-');
	});

	test('renders icon-only toolbar buttons with hover labels', async () => {
		const components = [makeComponent(1)];
		const influxFile = await makeInfluxFile({
			components,
			totalEntryCount: 1,
			settings: {
				listLimit: 10,
				sortingPrinciple: 'OLDEST_FIRST',
				includeFrontmatterLinks: false,
			},
		});
		const props = {
			influxFile,
			preview: false,
			plugin: makePlugin(),
		} satisfies ComponentProps;

		const html = renderToStaticMarkup(<InfluxReactComponent {...props} />);

		expect(html).toContain('influx-summary-row influx-summary-row--toolbar');
		expect(html).not.toContain('influx-summary-row influx-clickable');
		expect(html).toContain('Collapse all linked mentions');
		expect(html).toContain('List limit: 10 backlinks');
		expect(html).toContain('Sort order: oldest first');
		expect(html).toContain('Frontmatter links: excluded');
		expect(html).toContain('influx-control-tooltip');
		expect(html).not.toContain('title="Collapse all linked mentions"');
		expect(html).not.toContain('influx-summary-action');
		expect(html).not.toContain('influx-toolbar-button-badge');
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

		const html = renderToStaticMarkup(<InfluxReactComponent {...props} />);

		expect(html).toContain('data-href="Folder/Source-1.md"');
		expect(html).toContain('href="Elsewhere/Source-1.md"');
		expect(html).toContain('influx-result-source-context');
		expect(html).toContain('>Folder<');
		expect(html).toContain('>Elsewhere<');
		expect(html).not.toContain('target="_blank"');
	});

	test('renders preview summary in toolbar instead of pane header row', async () => {
		const components = [makeComponent(1)];
		const influxFile = await makeInfluxFile({ components, totalEntryCount: 1 });
		const props = {
			influxFile,
			preview: true,
			plugin: makePlugin(),
		} satisfies ComponentProps;

		const html = renderToStaticMarkup(<InfluxReactComponent {...props} />);

		expect(html).toContain('influx-toolbar');
		expect(html).toContain('influx-summary-row--toolbar');
		expect(html).not.toContain('class="influx-summary-row influx-clickable"');
	});
});

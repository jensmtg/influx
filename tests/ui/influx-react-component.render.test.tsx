import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InfluxReactComponent from '@/ui/influx-react-component';
import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';

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

function makeComponent(index: number): ExtendedInlinkingFile {
	const path = `Folder/Source-${index}.md`;
	return {
		inlinkingFile: {
			file: {
				path,
				basename: `Source-${index}`,
			},
			isLinkInTitle: false,
		},
		titleText: `Title ${index}`,
		summaryMarkdown: `Summary ${index}`,
		sourcePath: path,
	} as unknown as ExtendedInlinkingFile;
}

function makeInfluxFile(params: {
	components: ExtendedInlinkingFile[];
	totalEntryCount: number;
	show?: boolean;
}) {
	return {
		uuid: 'test-uuid',
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
		makeInfluxList: jest.fn().mockResolvedValue(undefined),
		toEntries: jest.fn().mockReturnValue(params.components),
		shouldUpdate: jest.fn().mockReturnValue(false),
	};
}

function makePlugin() {
	return {
		cycleListLimit: jest.fn(),
		toggleFrontmatterLinks: jest.fn(),
		toggleSortOrder: jest.fn(),
	};
}

describe('InfluxReactComponent render wiring', () => {
	test('renders empty-state message when show=true and there are no visible components', () => {
		const influxFile = makeInfluxFile({ components: [], totalEntryCount: 0 });
		const props = {
			influxFile: influxFile as unknown as React.ComponentProps<typeof InfluxReactComponent>['influxFile'],
			preview: false,
			plugin: makePlugin() as unknown as React.ComponentProps<typeof InfluxReactComponent>['plugin'],
		} satisfies React.ComponentProps<typeof InfluxReactComponent>;
		const html = renderToStaticMarkup(
			<InfluxReactComponent {...props} />
		);

		expect(html).toContain('No backlinks found for this note yet.');
		expect(html).toContain('Linked mentions');
		expect(html).toContain('<button');
		expect(html).toContain('aria-label="Search backlinks"');
		expect(html).toContain('aria-label="Collapse all linked mentions"');
	});

	test('renders editor load-more button label with exact remaining count', () => {
		const components = Array.from({ length: 45 }, (_, i) => makeComponent(i + 1));
		const influxFile = makeInfluxFile({ components, totalEntryCount: 45 });
		const props = {
			influxFile: influxFile as unknown as React.ComponentProps<typeof InfluxReactComponent>['influxFile'],
			preview: false,
			plugin: makePlugin() as unknown as React.ComponentProps<typeof InfluxReactComponent>['plugin'],
		} satisfies React.ComponentProps<typeof InfluxReactComponent>;

		const html = renderToStaticMarkup(
			<InfluxReactComponent {...props} />
		);

		expect(html).toContain('Load 5 more backlinks');
	});
});

/** @jest-environment jsdom */

import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import InfluxReactComponent from '@/ui/influx-react-component';
import type { ExtendedInlinkingFile } from '@/domain/backlinks/types';
import InfluxFile, { type InfluxFileApi } from '@/domain/backlinks/influx-file';
import { InlinkingFile, type InlinkingFileApi } from '@/domain/backlinks/inlinking-file';
import { DEFAULT_SETTINGS } from '@/types';
import { mockTFile } from '../mocks';

jest.mock('@/ui/markdown-mount', () => ({
	__esModule: true,
	default: (props: { className?: string; sourcePath: string }) => (
		<div className={props.className} data-testid="markdown-mount" data-source-path={props.sourcePath} />
	),
}));

jest.mock('@/platform/diagnostics/metrics', () => ({
	recordMetric: jest.fn(),
}));

jest.mock('@/platform/events/influx-updates', () => ({
	influxUpdates$: {
		subscribe: jest.fn(() => jest.fn()),
	},
}));

function createInlinkingApi(): jest.Mocked<InlinkingFileApi> {
	return {
		getMetadata: jest.fn().mockReturnValue(null),
		readFile: jest.fn(),
		compareLinkName: jest.fn(),
	};
}

function makeComponent(index: number): ExtendedInlinkingFile {
	const basename = `Source-${index}`;
	const path = `Folder/${basename}.md`;
	const inlinkingFile = new InlinkingFile(mockTFile(path, basename), createInlinkingApi());
	return {
		inlinkingFile,
		titleText: `Title ${basename}`,
		summaryMarkdown: `Summary ${basename}`,
		sourcePath: path,
	};
}

function createInfluxApi(): jest.Mocked<InfluxFileApi> {
	const api = {
		getFileByPath: jest.fn((path: string) => mockTFile(path, path.split('/').pop()?.replace(/\.md$/, '') ?? 'Target')),
		getMetadata: jest.fn().mockReturnValue(null),
		getBacklinks: jest.fn().mockReturnValue({ data: new Map() }),
		getBacklinksFresh: jest.fn(),
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
	} as jest.Mocked<InfluxFileApi>;

	api.getBacklinksFresh.mockImplementation((file) => api.getBacklinks(file));
	return api;
}

async function makeInfluxFile(components: ExtendedInlinkingFile[]) {
	const influxFile = await InfluxFile.create('Target.md', createInfluxApi());
	influxFile.uuid = 'links-uuid';
	influxFile.show = true;
	influxFile.collapsed = false;
	influxFile.components = components;
	influxFile.totalEntryCount = components.length;
	jest.spyOn(influxFile, 'makeInfluxList').mockImplementation(async (): Promise<void> => undefined);
	jest.spyOn(influxFile, 'toEntries').mockImplementation(() => components);
	jest.spyOn(influxFile, 'shouldUpdate').mockImplementation(() => false);
	return influxFile;
}

describe('InfluxReactComponent link behavior', () => {
	test('opens source title links in preview mode through workspace.openLinkText', async () => {
		const influxFile = await makeInfluxFile([makeComponent(1)]);
		const openLinkText = jest.fn();

		render(
			<InfluxReactComponent
				influxFile={influxFile}
				preview={true}
				plugin={{
					data: { settings: DEFAULT_SETTINGS },
					cycleListLimit: jest.fn(),
					toggleFrontmatterLinks: jest.fn(),
					toggleSortOrder: jest.fn(),
					app: {
						workspace: {
							openLinkText,
							trigger: jest.fn(),
						},
					},
				}}
			/>
		);

		fireEvent.click(screen.getByRole('link', { name: 'Source-1' }));

		expect(openLinkText).toHaveBeenCalledWith('Folder/Source-1.md', 'Folder/Source-1.md', false);
	});
});

import InfluxFile from '@/domain/backlinks/influx-file';
import type { InfluxFileApi } from '@/domain/backlinks/influx-file';
import { buildInfluxFileForRender, createInfluxFileForRender } from '@/domain/backlinks/influx-render-pipeline';
import { recordMetric } from '@/platform/diagnostics/metrics';
import { DEFAULT_SETTINGS } from '@/types';

jest.mock('@/platform/diagnostics/metrics', () => ({
	recordMetric: jest.fn(),
}));

describe('influx render pipeline', () => {
	type TestInfluxFile = Pick<InfluxFile, 'show' | 'totalEntryCount' | 'makeInfluxList' | 'toEntries'>;

	const createApi = (): jest.Mocked<InfluxFileApi> => ({
		getFileByPath: jest.fn(),
		getMetadata: jest.fn(),
		getBacklinks: jest.fn(),
		getBacklinksFresh: jest.fn(),
		getShowStatus: jest.fn(),
		getCollapsedStatus: jest.fn(),
		isIncludableSource: jest.fn(),
		getSettings: jest.fn().mockReturnValue(DEFAULT_SETTINGS),
		readFile: jest.fn(),
		compareLinkName: jest.fn(),
	});

	const createSettings = (overrides?: Partial<typeof DEFAULT_SETTINGS>) => ({
		...DEFAULT_SETTINGS,
		...overrides,
	});

	afterEach(() => {
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	test('createInfluxFileForRender returns a hidden result without building entries', async () => {
		const influxFile: TestInfluxFile = {
			show: false,
			totalEntryCount: 0,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn(),
		};
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as InfluxFile);

		const result = await createInfluxFileForRender({
			filePath: 'Hidden.md',
			api: createApi(),
			mode: 'sidebar',
			settings: createSettings({ listLimit: 10, metricsEnabled: true }),
		});

		expect(result).toEqual({
			influxFile,
			renderedComponents: [],
			hidden: true,
		});
		expect(influxFile.makeInfluxList).not.toHaveBeenCalled();
		expect(recordMetric).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'sidebar',
				ctx: expect.objectContaining({
					filePath: 'Hidden.md',
					show: false,
					renderedCount: 0,
				}),
			})
		);
	});

	test('buildInfluxFileForRender builds entries and records render counts', async () => {
		const entries = [{ sourcePath: 'Source.md' }];
		const influxFile: TestInfluxFile = {
			show: true,
			totalEntryCount: 3,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue(entries),
		};

		const result = await buildInfluxFileForRender({
			influxFile: influxFile as InfluxFile,
			filePath: 'Visible.md',
			mode: 'preview',
			settings: createSettings({ listLimit: 0, metricsEnabled: true }),
		});

		expect(influxFile.makeInfluxList).toHaveBeenCalledTimes(1);
		expect(influxFile.toEntries).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			influxFile,
			renderedComponents: entries,
			hidden: false,
		});
		expect(recordMetric).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'preview',
				ctx: expect.objectContaining({
					filePath: 'Visible.md',
					show: true,
					totalEntryCount: 3,
					renderedCount: 1,
				}),
			})
		);
	});

	test('createInfluxFileForRender forwards fresh backlink and recent-build cache flags', async () => {
		const influxFile: TestInfluxFile = {
			show: true,
			totalEntryCount: 2,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as InfluxFile);

		await createInfluxFileForRender({
			filePath: 'Fresh.md',
			api: createApi(),
			mode: 'sidebar',
			settings: createSettings({ metricsEnabled: true }),
			freshBacklinks: true,
			skipRecentBuildCache: true,
		});

		expect(influxFile.makeInfluxList).toHaveBeenCalledWith({
			freshBacklinks: true,
			skipRecentBuildCache: true,
		});
	});

	test('createInfluxFileForRender stops after create when aborted', async () => {
		const influxFile: TestInfluxFile = {
			show: true,
			totalEntryCount: 1,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as InfluxFile);

		const result = await createInfluxFileForRender({
			filePath: 'Abort.md',
			api: createApi(),
			mode: 'editor',
			settings: createSettings({ metricsEnabled: true }),
			shouldAbort: () => true,
		});

		expect(result).toBeNull();
		expect(influxFile.makeInfluxList).not.toHaveBeenCalled();
		expect(recordMetric).not.toHaveBeenCalled();
	});
});

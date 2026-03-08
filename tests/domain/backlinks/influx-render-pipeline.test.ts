import InfluxFile from '@/domain/backlinks/influx-file';
import { buildInfluxFileForRender, createInfluxFileForRender } from '@/domain/backlinks/influx-render-pipeline';
import { recordMetric } from '@/platform/diagnostics/metrics';

jest.mock('@/platform/diagnostics/metrics', () => ({
	recordMetric: jest.fn(),
}));

describe('influx render pipeline', () => {
	afterEach(() => {
		jest.restoreAllMocks();
		jest.clearAllMocks();
	});

	test('createInfluxFileForRender returns a hidden result without building entries', async () => {
		const influxFile = {
			show: false,
			totalEntryCount: 0,
			makeInfluxList: jest.fn(),
			toEntries: jest.fn(),
		};
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);

		const result = await createInfluxFileForRender({
			filePath: 'Hidden.md',
			api: {} as any,
			mode: 'sidebar',
			settings: { listLimit: 10, metricsEnabled: true },
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
		const influxFile = {
			show: true,
			totalEntryCount: 3,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue(entries),
		};

		const result = await buildInfluxFileForRender({
			influxFile: influxFile as any,
			filePath: 'Visible.md',
			mode: 'preview',
			settings: { listLimit: 0, metricsEnabled: true },
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

	test('createInfluxFileForRender stops after create when aborted', async () => {
		const influxFile = {
			show: true,
			totalEntryCount: 1,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([]),
		};
		jest.spyOn(InfluxFile, 'create').mockResolvedValue(influxFile as any);

		const result = await createInfluxFileForRender({
			filePath: 'Abort.md',
			api: {} as any,
			mode: 'editor',
			settings: { metricsEnabled: true },
			shouldAbort: () => true,
		});

		expect(result).toBeNull();
		expect(influxFile.makeInfluxList).not.toHaveBeenCalled();
		expect(recordMetric).not.toHaveBeenCalled();
	});
});

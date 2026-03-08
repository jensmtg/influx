import type { ObsidianInfluxSettings } from '../../types/settings';
import { recordMetric, type MetricMode } from '../../platform/diagnostics/metrics';
import { ApiAdapter } from './api-adapter';
import InfluxFile from './influx-file';
import type { ExtendedInlinkingFile } from './types';

export interface InfluxRenderPipelineResult {
	influxFile: InfluxFile;
	renderedComponents: ExtendedInlinkingFile[];
	hidden: boolean;
}

interface SharedPipelineParams {
	filePath: string;
	mode: MetricMode;
	settings?: Partial<ObsidianInfluxSettings> | null;
	shouldAbort?: () => boolean;
	startedAt?: number;
}

function recordInfluxPipelineMetric(params: {
	filePath: string;
	mode: MetricMode;
	settings?: Partial<ObsidianInfluxSettings> | null;
	startedAt: number;
	show: boolean;
	totalEntryCount: number;
	renderedCount: number;
}): void {
	const { filePath, mode, settings, startedAt, show, totalEntryCount, renderedCount } = params;
	recordMetric({
		name: 'influx.pipeline.total',
		mode,
		durationMs: performance.now() - startedAt,
		settings,
		always: true,
		ctx: {
			filePath,
			show,
			listLimit: settings?.listLimit || 0,
			totalEntryCount,
			renderedCount,
		},
	});
}

export async function buildInfluxFileForRender(
	params: SharedPipelineParams & { influxFile: InfluxFile }
): Promise<InfluxRenderPipelineResult | null> {
	const { influxFile, filePath, mode, settings, shouldAbort, startedAt = performance.now() } = params;

	if (shouldAbort?.()) {
		return null;
	}

	if (!influxFile.show) {
		recordInfluxPipelineMetric({
			filePath,
			mode,
			settings,
			startedAt,
			show: false,
			totalEntryCount: 0,
			renderedCount: 0,
		});
		return {
			influxFile,
			renderedComponents: [],
			hidden: true,
		};
	}

	await influxFile.makeInfluxList();
	if (shouldAbort?.()) {
		return null;
	}

	const renderedComponents = influxFile.toEntries();
	if (shouldAbort?.()) {
		return null;
	}

	recordInfluxPipelineMetric({
		filePath,
		mode,
		settings,
		startedAt,
		show: influxFile.show,
		totalEntryCount: influxFile.totalEntryCount,
		renderedCount: renderedComponents.length,
	});

	return {
		influxFile,
		renderedComponents,
		hidden: false,
	};
}

export async function createInfluxFileForRender(
	params: SharedPipelineParams & { api: ApiAdapter }
): Promise<InfluxRenderPipelineResult | null> {
	const { api, filePath, mode, settings, shouldAbort } = params;
	const startedAt = performance.now();
	const influxFile = await InfluxFile.create(filePath, api);

	if (shouldAbort?.()) {
		return null;
	}

	return buildInfluxFileForRender({
		influxFile,
		filePath,
		mode,
		settings,
		shouldAbort,
		startedAt,
	});
}

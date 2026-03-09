import type { ExtendedInlinkingFile } from './types';
import { InlinkingFile } from './inlinking-file';
import { recordMetric } from '../../platform/diagnostics/metrics';
import type { InfluxFileApi } from './influx-file';

export function createInfluxRenderEntries(params: {
	inlinkingFiles: InlinkingFile[];
	targetFilePath?: string;
}): ExtendedInlinkingFile[] {
	const { inlinkingFiles, targetFilePath } = params;
	return inlinkingFiles.map((inlinkingFile): ExtendedInlinkingFile => ({
		inlinkingFile,
		titleText: (inlinkingFile.title ?? '').trim(),
		summaryMarkdown: inlinkingFile.summary ?? '',
		sourcePath: inlinkingFile.file.path ?? targetFilePath ?? '/',
	}));
}

export function recordInfluxRenderEntriesMetric(params: {
	api: InfluxFileApi;
	targetFilePath?: string;
	inputCount: number;
	renderedCount: number;
	startedAt: number;
}): void {
	const { api, targetFilePath, inputCount, renderedCount, startedAt } = params;
	recordMetric({
		name: 'influx.markdown.render',
		mode: 'shared',
		durationMs: performance.now() - startedAt,
		settings: api.getSettings(),
		ctx: {
			filePath: targetFilePath,
			inputCount,
			renderedCount,
			markdownConcurrency: 0,
		},
	});
}

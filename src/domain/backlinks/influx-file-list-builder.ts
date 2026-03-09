import { TFile } from 'obsidian';
import type InfluxFile from './influx-file';
import type { InfluxFileApi } from './influx-file';
import type { BacklinksObject } from './types';
import { InlinkingFile } from './inlinking-file';
import { logger } from '../../platform/diagnostics/logger';
import { mapWithConcurrency } from '../../shared/async/concurrency';
import { CONSTANTS } from '../../config/constants';
import { DEFAULT_SETTINGS } from '../../types';
import { recordMetric } from '../../platform/diagnostics/metrics';
import { collectValidBacklinkFiles, sortInfluxSourceFiles } from './influx-file-build-helpers';
import {
	createEmptyInfluxListBuildResult,
	type InfluxListBuildResult,
} from './influx-file-list-cache';

export async function buildInfluxList(params: {
	contextFile: InfluxFile;
	currentFile: TFile;
	backlinks: BacklinksObject | null;
	api: InfluxFileApi;
	settings: typeof DEFAULT_SETTINGS;
	settingsHash: string;
}): Promise<InfluxListBuildResult> {
	const { contextFile, currentFile, backlinks, api, settings, settingsHash } = params;
	const startTime = performance.now();
	if (!backlinks || !backlinks.data) {
		recordInfluxBuildMetric({
			currentFile,
			settings,
			startTime,
			candidateSourceCount: 0,
			processedSourceCount: 0,
		});
		return createEmptyInfluxListBuildResult();
	}

	const listLimit = settings.listLimit || 0;
	const validFiles = collectValidBacklinkFiles({
		backlinks,
		currentFilePath: currentFile.path,
		api,
	});
	const totalEntryCount = validFiles.length;
	const sortedFiles = sortInfluxSourceFiles(validFiles, settings);
	const filesToProcess = listLimit > 0 ? sortedFiles.slice(0, listLimit) : sortedFiles;
	const processed = await mapWithConcurrency(
		filesToProcess,
		CONSTANTS.SUMMARY_BUILD_CONCURRENCY,
		async (file: TFile): Promise<InlinkingFile | null> => {
			try {
				const inlinkingFile = new InlinkingFile(file, api);
				await inlinkingFile.makeSummary(contextFile, settingsHash);
				return inlinkingFile;
			} catch (error) {
				logger.error(`Failed to process file ${file.path}:`, { filePath: file.path, error });
				return null;
			}
		}
	);

	const inlinkingFiles = processed.filter((item): item is InlinkingFile => item !== null);
	recordInfluxBuildMetric({
		currentFile,
		settings,
		startTime,
		candidateSourceCount: validFiles.length,
		processedSourceCount: inlinkingFiles.length,
	});

	if (inlinkingFiles.length < filesToProcess.length) {
		logger.warn(`Only ${inlinkingFiles.length} of ${filesToProcess.length} files processed successfully`, {
			processed: inlinkingFiles.length,
			totalAttempted: filesToProcess.length,
			totalCandidates: validFiles.length,
		});
	}

	return {
		inlinkingFiles,
		totalEntryCount,
	};
}

function recordInfluxBuildMetric(params: {
	currentFile: TFile;
	settings: typeof DEFAULT_SETTINGS;
	startTime: number;
	candidateSourceCount: number;
	processedSourceCount: number;
}): void {
	const { currentFile, settings, startTime, candidateSourceCount, processedSourceCount } = params;
	recordMetric({
		name: 'influx.inlinking.build',
		mode: 'shared',
		durationMs: performance.now() - startTime,
		settings,
		ctx: {
			filePath: currentFile.path,
			candidateSourceCount,
			processedSourceCount,
			listLimit: settings.listLimit || 0,
			summaryConcurrency: CONSTANTS.SUMMARY_BUILD_CONCURRENCY,
		},
	});
}

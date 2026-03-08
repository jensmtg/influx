import { TFile, CachedMetadata, normalizePath } from 'obsidian';
import type { ApiAdapter } from './api-adapter';
import type { BacklinksObject, ExtendedInlinkingFile } from './types';
import { InlinkingFile, type InlinkingFileApi } from './inlinking-file';
import { logger } from '../../platform/diagnostics/logger';
import { mapWithConcurrency } from '../../shared/async/concurrency';
import { CONSTANTS } from '../../config/constants';
import { DEFAULT_SETTINGS } from '../../types';
import { recordMetric } from '../../platform/diagnostics/metrics';
import { computeSettingsHash } from '../settings/settings-hash';
import { cacheManager } from '../../platform/cache/cache-manager';
import { collectValidBacklinkFiles, sortInfluxSourceFiles } from './influx-file-build-helpers';

export interface InfluxFileApi extends InlinkingFileApi {
    getFileByPath: ApiAdapter['getFileByPath'];
    getBacklinks: ApiAdapter['getBacklinks'];
    getShowStatus: ApiAdapter['getShowStatus'];
    getCollapsedStatus: ApiAdapter['getCollapsedStatus'];
    isIncludableSource: ApiAdapter['isIncludableSource'];
    getSettings: ApiAdapter['getSettings'];
}

export default class InfluxFile {
    private static readonly RECENT_LIST_BUILD_TTL_MS = 1500;
    private static inflightListBuilds = new Map<string, Promise<{
        inlinkingFiles: InlinkingFile[];
        totalEntryCount: number;
    }>>();
    private static recentListBuilds = new Map<string, {
        value: {
            inlinkingFiles: InlinkingFile[];
            totalEntryCount: number;
        };
        timestamp: number;
    }>();

    uuid: string;
    api: InfluxFileApi;
    file: TFile | null;
    meta: CachedMetadata | null;
    backlinks: BacklinksObject | null;
    inlinkingFiles: InlinkingFile[];
    components: ExtendedInlinkingFile[];
    show: boolean;
    collapsed: boolean;
    totalEntryCount: number;
    private initialized: boolean = false;


    /**
     * Async factory method to create and initialize an InfluxFile.
     * This prevents blocking operations in the constructor.
     */
    static async create(path: string, apiAdapter: InfluxFileApi): Promise<InfluxFile> {
        const influxFile = new InfluxFile(path, apiAdapter);
        await influxFile.initialize();
        return influxFile;
    }

    private constructor(path: string, apiAdapter: InfluxFileApi) {
        this.uuid = crypto.randomUUID()
        this.api = apiAdapter
        this.file = this.api.getFileByPath(path)
        // Initialize with default values
        this.show = false
        this.collapsed = false
        this.meta = null
        this.backlinks = null
        this.inlinkingFiles = []
        this.components = []
        this.totalEntryCount = 0
    }

    /**
     * Initialize InfluxFile with metadata, backlinks, and show status.
     * This is called by factory method to avoid blocking in the constructor.
     */
	private async initialize(): Promise<void> {
		if (!this.file) {
			this.initialized = true;
			return;
		}
		this.meta = this.api.getMetadata(this.file)
		this.refreshVisibility()
		this.initialized = true;
	}

	refreshVisibility(): boolean {
		if (!this.file) {
			this.show = false
			this.collapsed = false
			return this.show
		}

		this.show = this.api.getShowStatus(this.file)
		this.collapsed = this.api.getCollapsedStatus(this.file)
		return this.show
	}

    /**
     * Ensure InfluxFile is properly initialized before use.
     * This prevents race conditions when methods are called before async initialization completes.
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error('InfluxFile must be created using the async create() factory method');
        }
    }

    shouldUpdate(file: TFile) {
        this.ensureInitialized();
        if (!this.file) {
            return false;
        }
        this.backlinks = this.api.getBacklinks(this.file)
        if (!this.backlinks || !this.backlinks.data) {
            return false
        }

        const normalizedTarget = normalizePath(file.path);
        const paths = this.backlinks.data instanceof Map
            ? Array.from(this.backlinks.data.keys())
            : Object.keys(this.backlinks.data);

        return paths.some(path =>
            normalizePath(path) === normalizedTarget
        );
    }

    async makeInfluxList() {
        this.ensureInitialized();
		if (!this.file) {
			this.inlinkingFiles = [];
			this.totalEntryCount = 0;
			return;
		}

		const settings = this.api.getSettings();
		const settingsHash = computeSettingsHash(settings);
        const dependencyRevision = cacheManager.getDependencyRevision();
        const buildKey = this.makeInflightListBuildKey(this.file.path, this.file.stat?.mtime ?? 0, settingsHash, dependencyRevision);

        const recent = InfluxFile.recentListBuilds.get(buildKey);
        if (recent && Date.now() - recent.timestamp <= InfluxFile.RECENT_LIST_BUILD_TTL_MS) {
            this.inlinkingFiles = [...recent.value.inlinkingFiles];
            this.totalEntryCount = recent.value.totalEntryCount;
            return;
        }

        const inflight = InfluxFile.inflightListBuilds.get(buildKey);
        if (inflight) {
            const shared = await inflight;
            this.inlinkingFiles = [...shared.inlinkingFiles];
            this.totalEntryCount = shared.totalEntryCount;
            return;
        }

        const buildPromise = this.buildInfluxList(settings, settingsHash);
        InfluxFile.inflightListBuilds.set(buildKey, buildPromise);
        try {
            const built = await buildPromise;
            this.inlinkingFiles = [...built.inlinkingFiles];
            this.totalEntryCount = built.totalEntryCount;
            InfluxFile.recentListBuilds.set(buildKey, {
                value: {
                    inlinkingFiles: built.inlinkingFiles,
                    totalEntryCount: built.totalEntryCount,
                },
                timestamp: Date.now(),
            });
            this.pruneRecentListBuilds();
        } finally {
            if (InfluxFile.inflightListBuilds.get(buildKey) === buildPromise) {
                InfluxFile.inflightListBuilds.delete(buildKey);
            }
        }
    }

    private makeInflightListBuildKey(path: string, fileMtime: number, settingsHash: string, dependencyRevision: number): string {
        return `${normalizePath(path)}|${fileMtime}|${settingsHash}|${dependencyRevision}`;
    }

    private async buildInfluxList(
        settings: typeof DEFAULT_SETTINGS,
        settingsHash: string
    ): Promise<{ inlinkingFiles: InlinkingFile[]; totalEntryCount: number }> {
        const currentFile = this.file;
        if (!currentFile) {
            return {
                inlinkingFiles: [],
                totalEntryCount: 0,
            };
        }

        const startTime = performance.now();
        this.backlinks = this.api.getBacklinks(currentFile);
        if (!this.backlinks || !this.backlinks.data) {
            recordMetric({
                name: 'influx.inlinking.build',
                mode: 'shared',
                durationMs: performance.now() - startTime,
                settings,
                ctx: {
                    filePath: currentFile.path,
                    candidateSourceCount: 0,
                    processedSourceCount: 0,
                    listLimit: settings.listLimit || 0,
                    summaryConcurrency: CONSTANTS.SUMMARY_BUILD_CONCURRENCY,
                }
            });
            return {
                inlinkingFiles: [],
                totalEntryCount: 0,
            };
        }

        const listLimit = settings.listLimit || 0;
        const validFiles = collectValidBacklinkFiles({
            backlinks: this.backlinks,
            currentFilePath: currentFile.path,
            api: this.api,
        });

        const totalEntryCount = validFiles.length;
        const sortedFiles = sortInfluxSourceFiles(validFiles, settings);
        const filesToProcess = listLimit > 0 ? sortedFiles.slice(0, listLimit) : sortedFiles;

        const processed = await mapWithConcurrency(
            filesToProcess,
            CONSTANTS.SUMMARY_BUILD_CONCURRENCY,
            async (file: TFile): Promise<InlinkingFile | null> => {
                try {
                    const inlinkingFile = new InlinkingFile(file, this.api);
                    await inlinkingFile.makeSummary(this, settingsHash);
                    return inlinkingFile;
                } catch (error) {
                    logger.error(`Failed to process file ${file.path}:`, { filePath: file.path, error });
                    return null;
                }
            }
        );

        const inlinkingFilesNew = processed.filter((item): item is InlinkingFile => item !== null);
        recordMetric({
            name: 'influx.inlinking.build',
            mode: 'shared',
            durationMs: performance.now() - startTime,
            settings,
            ctx: {
                filePath: currentFile.path,
                candidateSourceCount: validFiles.length,
                processedSourceCount: inlinkingFilesNew.length,
                listLimit,
                summaryConcurrency: CONSTANTS.SUMMARY_BUILD_CONCURRENCY,
            }
        });

        // Warn user if some files failed to process
        if (inlinkingFilesNew.length < filesToProcess.length) {
            logger.warn(`Only ${inlinkingFilesNew.length} of ${filesToProcess.length} files processed successfully`, {
                processed: inlinkingFilesNew.length,
                totalAttempted: filesToProcess.length,
                totalCandidates: validFiles.length
            });
        }

        return {
            inlinkingFiles: inlinkingFilesNew,
            totalEntryCount,
        };
    }

    private pruneRecentListBuilds(): void {
        const now = Date.now();
        for (const [key, entry] of InfluxFile.recentListBuilds.entries()) {
            if (now - entry.timestamp > InfluxFile.RECENT_LIST_BUILD_TTL_MS) {
                InfluxFile.recentListBuilds.delete(key);
            }
        }
    }

    static clearBuildCaches(): void {
        InfluxFile.inflightListBuilds.clear();
        InfluxFile.recentListBuilds.clear();
    }

    static clearBuildCachesForTests(): void {
        InfluxFile.clearBuildCaches();
    }
    toEntries(): ExtendedInlinkingFile[] {
        this.ensureInitialized();
        if (!this.show) {
            return [];
        }

        const settings = this.api.getSettings();
        const startTime = performance.now();
        const targetFilePath = this.file?.path;
        const entries = this.inlinkingFiles.map((inlinkingFile): ExtendedInlinkingFile => ({
            inlinkingFile,
            titleText: (inlinkingFile.title ?? '').trim(),
            summaryMarkdown: inlinkingFile.summary ?? '',
            sourcePath: inlinkingFile.file?.path ?? targetFilePath ?? '/',
        }));

        recordMetric({
            name: 'influx.markdown.render',
            mode: 'shared',
            durationMs: performance.now() - startTime,
            settings,
            ctx: {
                filePath: targetFilePath,
                inputCount: this.inlinkingFiles.length,
                renderedCount: entries.length,
                markdownConcurrency: 0,
            }
        });

        this.components = entries
        return entries
    }
}

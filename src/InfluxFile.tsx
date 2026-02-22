import { TFile, CachedMetadata, normalizePath } from 'obsidian';
import { ApiAdapter, BacklinksObject, ExtendedInlinkingFile } from './apiAdapter';
import { InlinkingFile } from './InlinkingFile';
import { logger } from './utils/logger';
import { createFileComparator } from './settings-utils';
import { mapWithConcurrency } from './utils/concurrency';
import { CONSTANTS } from './constants';
import { DEFAULT_SETTINGS } from './types';
import { recordMetric } from './utils/metrics';


export default class InfluxFile {
    uuid: string;
    api: ApiAdapter;
    file: TFile;
    meta: CachedMetadata;
    backlinks: BacklinksObject;
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
    static async create(path: string, apiAdapter: ApiAdapter): Promise<InfluxFile> {
        const influxFile = new InfluxFile(path, apiAdapter);
        await influxFile.initialize();
        return influxFile;
    }

    private constructor(path: string, apiAdapter: ApiAdapter) {
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
        this.backlinks = this.api.getBacklinks(this.file)
        this.show = this.api.getShowStatus(this.file)
        this.collapsed = this.api.getCollapsedStatus(this.file)
        this.initialized = true;
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

        // Normalize paths to handle case-insensitive comparison
        const normalizedTarget = normalizePath(file.path).toLowerCase();
        const paths = this.backlinks.data instanceof Map
            ? Array.from(this.backlinks.data.keys())
            : Object.keys(this.backlinks.data);

        return paths.some(path =>
            normalizePath(path).toLowerCase() === normalizedTarget
        );
    }

    async makeInfluxList() {
        this.ensureInitialized();
        if (!this.file) {
            this.inlinkingFiles = [];
            this.totalEntryCount = 0;
            return;
        }

        const startTime = performance.now();
        this.backlinks = this.api.getBacklinks(this.file)
        if (!this.backlinks || !this.backlinks.data) {
            this.inlinkingFiles = []
            this.totalEntryCount = 0;
            const emptySettings = typeof (this.api as { getSettings?: () => typeof DEFAULT_SETTINGS }).getSettings === 'function'
                ? this.api.getSettings()
                : DEFAULT_SETTINGS;
            recordMetric({
                name: 'influx.inlinking.build',
                mode: 'shared',
                durationMs: performance.now() - startTime,
                settings: emptySettings,
                ctx: {
                    filePath: this.file.path,
                    candidateSourceCount: 0,
                    processedSourceCount: 0,
                    listLimit: emptySettings.listLimit || 0,
                    summaryConcurrency: CONSTANTS.SUMMARY_BUILD_CONCURRENCY,
                }
            });
            return
        }

        const settings = typeof (this.api as { getSettings?: () => typeof DEFAULT_SETTINGS }).getSettings === 'function'
            ? this.api.getSettings()
            : DEFAULT_SETTINGS;
        const fileComparator = createFileComparator(settings.sortingAttribute, settings.sortingPrinciple);
        const listLimit = settings.listLimit || 0;
        const normalizedCurrentPath = normalizePath(this.file.path).toLowerCase();

        const validFiles: TFile[] = []
        // Unify iteration pattern for both Map and Object backlinks data
        const entries = this.backlinks.data instanceof Map
            ? this.backlinks.data.entries()
            : Object.entries(this.backlinks.data);

        for (const [pathAsKey] of entries) {
            const normalizedSourcePath = normalizePath(pathAsKey).toLowerCase();
            if (normalizedSourcePath === normalizedCurrentPath || !this.api.isIncludableSource(pathAsKey)) {
                continue;
            }
            const file = this.api.getFileByPath(pathAsKey)
            if (file !== null) {
                validFiles.push(file)
            }
        }

        this.totalEntryCount = validFiles.length;

        const sortedFiles = [...validFiles].sort((a, b) => fileComparator({ file: a }, { file: b }));
        const filesToProcess = listLimit > 0 ? sortedFiles.slice(0, listLimit) : sortedFiles;

        const processed = await mapWithConcurrency(
            filesToProcess,
            CONSTANTS.SUMMARY_BUILD_CONCURRENCY,
            async (file: TFile): Promise<InlinkingFile | null> => {
                try {
                    const inlinkingFile = new InlinkingFile(file, this.api);
                    await inlinkingFile.makeSummary(this);
                    return inlinkingFile;
                } catch (error) {
                    logger.error(`Failed to process file ${file.path}:`, { filePath: file.path, error });
                    return null;
                }
            }
        );

        const inlinkingFilesNew = processed.filter((item): item is InlinkingFile => item !== null);
        this.inlinkingFiles = inlinkingFilesNew

        recordMetric({
            name: 'influx.inlinking.build',
            mode: 'shared',
            durationMs: performance.now() - startTime,
            settings,
            ctx: {
                filePath: this.file.path,
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
    }
    async renderAllMarkdownBlocks(): Promise<ExtendedInlinkingFile[]> {
        this.ensureInitialized();
        if (!this.show) {
            return [];
        }

        const components = await this.api.renderAllMarkdownBlocks(this.inlinkingFiles, this.file?.path)
        this.components = components
        return components
    }
}

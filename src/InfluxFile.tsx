import { TFile } from 'obsidian';
import { ApiAdapter, BacklinksObject, ExtendedInlinkingFile } from './apiAdapter';
import { InlinkingFile } from './InlinkingFile';
import ObsidianInflux from './main';
import { v4 as uuidv4 } from 'uuid';
import {
    getBacklinkSourcePaths,
    hasBacklinkEntries,
} from './backlink-utils';
import { mapWithConcurrency } from './async-utils';

const MAX_CONCURRENT_SOURCE_JOBS = 8;


export default class InfluxFile {
    uuid: string;
    api: ApiAdapter;
    influx: ObsidianInflux;
    file: TFile;
    backlinks: BacklinksObject;
    inlinkingFiles: InlinkingFile[];
    components: ExtendedInlinkingFile[];
    show: boolean;
    collapsed: boolean;


    /**
     * Async factory method to create and initialize an InfluxFile.
     * This prevents blocking operations in the constructor.
     */
    static async create(path: string, apiAdapter: ApiAdapter, influx: ObsidianInflux): Promise<InfluxFile> {
        const influxFile = new InfluxFile(path, apiAdapter, influx);
        await influxFile.initialize();
        return influxFile;
    }

    private constructor(path: string, apiAdapter: ApiAdapter, influx: ObsidianInflux) {
        this.uuid = uuidv4()
        this.api = apiAdapter
        this.influx = influx
        this.file = this.api.getFileByPath(path)
        // Initialize with default values
        this.show = false
        this.collapsed = false
        this.backlinks = null
        this.inlinkingFiles = []
        this.components = []
    }

    /**
     * Initialize the InfluxFile with metadata, backlinks, and show status.
     * This is called by the factory method to avoid blocking in the constructor.
     */
    private async initialize(): Promise<void> {
        if (!this.file) {
            return;
        }
        await this.refreshBacklinks()
    }

    hasBacklinks(): boolean {
        return hasBacklinkEntries(this.backlinks)
    }

    /**
     * Build everything needed by the UI, stopping before expensive work whenever
     * there is nothing that can produce a visible entry.
     */
    async prepare(refreshBacklinks = false): Promise<boolean> {
        this.components = []

        if (refreshBacklinks) {
            await this.refreshBacklinks()
        }

        if (!this.file || !this.show) {
            this.inlinkingFiles = []
            return false
        }

        if (!this.hasBacklinks()) {
            this.inlinkingFiles = []
            return this.api.getSettings().showWithoutBacklinks
        }

        await this.makeInfluxList()
        if (this.inlinkingFiles.length === 0) {
            return this.api.getSettings().showWithoutBacklinks
        }

        await this.renderAllMarkdownBlocks()
        return this.components.length > 0 || this.api.getSettings().showWithoutBacklinks
    }

    // is the file that triggers update part of the current files inlinked files?
    async shouldUpdate(files: TFile | readonly TFile[]): Promise<boolean> {
        const changedFiles = Array.isArray(files) ? files : [files]
        const previousPaths = new Set(getBacklinkSourcePaths(this.backlinks))
        await this.refreshBacklinks()
        const currentPaths = new Set(getBacklinkSourcePaths(this.backlinks))

        // Include the old set so removing the final link still clears the UI.
        return changedFiles.some(file =>
            file.path === this.file?.path
            || previousPaths.has(file.path)
            || currentPaths.has(file.path),
        )
    }

    private async refreshBacklinks(): Promise<void> {
        if (this.file) this.file = this.api.getFileByPath(this.file.path)
        if (!this.file) {
            this.backlinks = null
            this.show = false
            this.collapsed = false
            return
        }

        this.backlinks = await this.api.getBacklinks(this.file)

        // Target-note filters still decide whether the section belongs on the
        // page when the optional empty state is enabled.
        this.show = this.api.getShowStatus(this.file)

        // Backlink-free notes do not need metadata, filter, excerpt, or Markdown work.
        if (!this.hasBacklinks()) {
            this.collapsed = false
            return
        }

        this.collapsed = this.api.getCollapsedStatus(this.file)
    }

    async makeInfluxList() {
        const inlinkingFilesNew: InlinkingFile[] = []
        if (!this.show || !this.hasBacklinks()) {
            this.inlinkingFiles = inlinkingFilesNew
            this.components = []
            return
        }
        const validPaths: string[] = []
        // Unify iteration pattern for both Map and Object backlinks data
        const entries = this.backlinks.data instanceof Map
            ? this.backlinks.data.entries()
            : Object.entries(this.backlinks.data);

        for (const [pathAsKey, links] of entries) {
            if (Array.isArray(links) && links.length > 0 && pathAsKey !== this.file.path && this.api.isIncludableSource(pathAsKey)) {
                validPaths.push(pathAsKey);
            }
        }
        // Single pass: get files and filter nulls in one operation
        const validFiles: TFile[] = []
        for (const pathAsKey of validPaths) {
            const file = this.api.getFileByPath(pathAsKey)
            if (file !== null) {
                validFiles.push(file)
            }
        }
        const sortedFiles = this.api.sortFilesForRendering(validFiles)
        const listLimit = this.api.getSettings().listLimit
        const processFile = async (file: TFile): Promise<InlinkingFile | null> => {
            try {
                const inlinkingFile = new InlinkingFile(file, this.api);
                await inlinkingFile.makeSummary(this);
                return inlinkingFile;
            } catch (error) {
                console.error(`[Influx] Failed to process file ${file.path}:`, error);
                // Continue processing other files
                return null;
            }
        }

        const processedFiles: InlinkingFile[] = []
        if (listLimit > 0) {
            let nextIndex = 0
            while (nextIndex < sortedFiles.length && processedFiles.length < listLimit) {
                const remainingSlots = listLimit - processedFiles.length
                const batchSize = Math.min(MAX_CONCURRENT_SOURCE_JOBS, remainingSlots)
                const batch = sortedFiles.slice(nextIndex, nextIndex + batchSize)
                nextIndex += batch.length
                const results = await mapWithConcurrency(batch, MAX_CONCURRENT_SOURCE_JOBS, processFile)
                processedFiles.push(...results.filter(
                    (file): file is InlinkingFile => file !== null,
                ))
            }
        } else {
            const results = await mapWithConcurrency(
                sortedFiles,
                MAX_CONCURRENT_SOURCE_JOBS,
                processFile,
            )
            processedFiles.push(...results.filter(
                (file): file is InlinkingFile => file !== null,
            ))
        }
        this.inlinkingFiles = processedFiles

        // Warn user if some files failed to process
        const expectedCount = listLimit > 0
            ? Math.min(listLimit, sortedFiles.length)
            : sortedFiles.length
        if (this.inlinkingFiles.length < expectedCount) {
            console.warn(`[Influx] Only ${this.inlinkingFiles.length} of ${expectedCount} files processed successfully`);
        }
    }
    async renderAllMarkdownBlocks() {

        // Avoid rendering if no-show
        if (!this.show || this.inlinkingFiles.length === 0) {
            this.components = []
            return this.components
        }

        const components = await this.api.renderAllMarkdownBlocks(this.inlinkingFiles)
        this.components = components
        return components
    }


}

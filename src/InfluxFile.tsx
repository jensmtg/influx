import { TFile, CachedMetadata, normalizePath } from 'obsidian';
import { ApiAdapter, BacklinksObject, ExtendedInlinkingFile } from './apiAdapter';
import { InlinkingFile } from './InlinkingFile';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';


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
        this.uuid = uuidv4()
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
     * Initialize the InfluxFile with metadata, backlinks, and show status.
     * This is called by the factory method to avoid blocking in the constructor.
     */
    private async initialize(): Promise<void> {
        if (!this.file) {
            return;
        }
        this.meta = this.api.getMetadata(this.file)
        this.backlinks = this.api.getBacklinks(this.file)
        this.show = this.api.getShowStatus(this.file)
        this.collapsed = this.api.getCollapsedStatus(this.file)
    }

    // is the file that triggers update part of the current files inlinked files?
    shouldUpdate(file: TFile) {
        if (!this.file) {
            return false;
        }
        this.backlinks = this.api.getBacklinks(this.file) // Must refresh in case of renamings.
        if (!this.backlinks || !this.backlinks.data) {
            return false
        }

        // Normalize target path
        const normalizedTarget = normalizePath(file.path).toLowerCase();
        const paths = this.backlinks.data instanceof Map
            ? Array.from(this.backlinks.data.keys())
            : Object.keys(this.backlinks.data);

        // Normalize and compare paths
        return paths.some(path =>
            normalizePath(path).toLowerCase() === normalizedTarget
        );
    }

    async makeInfluxList() {
        if (!this.file) {
            this.inlinkingFiles = [];
            return;
        }
        this.backlinks = this.api.getBacklinks(this.file) // Must refresh in case of renamings.
        const inlinkingFilesNew: InlinkingFile[] = []
        if (!this.backlinks || !this.backlinks.data) {
            this.inlinkingFiles = inlinkingFilesNew
            return
        }
        const validPaths: string[] = []
        // Unify iteration pattern for both Map and Object backlinks data
        const entries = this.backlinks.data instanceof Map
            ? this.backlinks.data.entries()
            : Object.entries(this.backlinks.data);

        for (const [pathAsKey] of entries) {
            if (pathAsKey !== this.file.path && this.api.isIncludableSource(pathAsKey)) {
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
        await Promise.all(validFiles.map(async (file: TFile) => {
            try {
                const inlinkingFile = new InlinkingFile(file, this.api);
                await inlinkingFile.makeSummary(this);
                inlinkingFilesNew.push(inlinkingFile);
            } catch (error) {
                logger.error(`Failed to process file ${file.path}:`, { filePath: file.path, error });
                // Continue processing other files
            }
        }))
        this.inlinkingFiles = inlinkingFilesNew
        this.totalEntryCount = inlinkingFilesNew.length

        // Warn user if some files failed to process
        if (inlinkingFilesNew.length < validFiles.length) {
            logger.warn(`Only ${inlinkingFilesNew.length} of ${validFiles.length} files processed successfully`, {
                processed: inlinkingFilesNew.length,
                total: validFiles.length
            });
        }
    }
    async renderAllMarkdownBlocks(): Promise<ExtendedInlinkingFile[]> {
        if (!this.show) {
            return [];
        }

        const components = await this.api.renderAllMarkdownBlocks(this.inlinkingFiles)
        this.components = components
        return components
    }
}

import { TFile, CachedMetadata } from 'obsidian';
import { ApiAdapter, BacklinksObject, ExtendedInlinkingFile } from './apiAdapter';
import { InlinkingFile } from './InlinkingFile';
import ObsidianInflux from './main';
import { v4 as uuidv4 } from 'uuid';


export default class InfluxFile {
    uuid: string;
    api: ApiAdapter;
    influx: ObsidianInflux;
    file: TFile;
    meta: CachedMetadata;
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
        this.meta = null
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
        this.meta = this.api.getMetadata(this.file)
        this.backlinks = this.api.getBacklinks(this.file)
        this.show = this.api.getShowStatus(this.file)
        this.collapsed = this.api.getCollapsedStatus(this.file)
    }

    // is the file that triggers update part of the current files inlinked files?
    shouldUpdate(file: TFile) {
        this.backlinks = this.api.getBacklinks(this.file) // Must refresh in case of renamings.
        if (!this.backlinks || !this.backlinks.data) {
            return false
        }
        const paths = this.backlinks.data instanceof Map
            ? Array.from(this.backlinks.data.keys())
            : Object.keys(this.backlinks.data)
        return paths.includes(file.path)
    }

    async makeInfluxList() {
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
            const inlinkingFile = new InlinkingFile(file, this.api)
            await inlinkingFile.makeSummary(this)
            inlinkingFilesNew.push(inlinkingFile)
        }))
        this.inlinkingFiles = inlinkingFilesNew
    }
    async renderAllMarkdownBlocks() {

        // Avoid rendering if no-show
        if (!this.show) {
            return
        }

        const components = await this.api.renderAllMarkdownBlocks(this.inlinkingFiles)
        this.components = components
        return components
    }


}


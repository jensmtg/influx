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


    constructor(path: string, apiAdapter: ApiAdapter, influx: ObsidianInflux) {
        this.uuid = uuidv4()
        this.api = apiAdapter
        this.influx = influx
        this.file = this.api.getFileByPath(path)
        if (!this.file) {
            this.show = false
            this.collapsed = false
            this.meta = null
            this.backlinks = null
            this.inlinkingFiles = []
            this.components = []
            return
        }
        this.meta = this.api.getMetadata(this.file)
        this.backlinks = this.api.getBacklinks(this.file)
        this.inlinkingFiles = []
        this.components = []
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
        if (this.backlinks.data instanceof Map) {
            for (const [pathAsKey] of this.backlinks.data) {
                if (pathAsKey !== this.file.path && this.api.isIncludableSource(pathAsKey)) {
                    validPaths.push(pathAsKey)
                }
            }
        } else {
            for (const pathAsKey of Object.keys(this.backlinks.data)) {
                if (pathAsKey !== this.file.path && this.api.isIncludableSource(pathAsKey)) {
                    validPaths.push(pathAsKey)
                }
            }
        }
        const backlinksAsFiles = validPaths.map((pathAsKey) => this.api.getFileByPath(pathAsKey))
        const validFiles = backlinksAsFiles.filter((file: TFile) => file !== null)
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


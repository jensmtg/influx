import { TFile, CachedMetadata } from 'obsidian';
import { ApiAdapter, BacklinksObject, ExtendedInlinkingFile } from './apiAdapter';
import { InlinkingFile } from './InlinkingFile';
import ObsidianInflux from './main';



export default class InfluxFile {
    id: string;
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
        this.id = Math.random().toString()
        this.api = apiAdapter
        this.influx = influx
        this.file = this.api.getFileByPath(path)
        this.meta = this.api.getMetadata(this.file)
        this.backlinks = this.api.getBacklinks(this.file)
        this.inlinkingFiles = []
        this.components = []
        this.show = this.api.getShowStatus(this.file)
        this.collapsed = this.api.getCollapsedStatus(this.file)

    }

    async makeInfluxList() {
        const inlinkingFilesNew: InlinkingFile[] = []
        const backlinksAsFiles = Object.keys(this.backlinks.data).map((pathAsKey) => this.api.getFileByPath(pathAsKey))
        await Promise.all(backlinksAsFiles.map(async (file: TFile) => {
            const inlinkingFile = new InlinkingFile(file, this.api)
            await inlinkingFile.makeContextualSummaries(this)
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


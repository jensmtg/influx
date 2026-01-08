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
        const paths = Object.keys(this.backlinks.data)
        return paths.includes(file.path)
    }

    async makeInfluxList() {
        // 1. Get the Map from getBacklinks
        this.backlinks = this.api.getBacklinks(this.file);
        // console.log('Backlinks data:', this.backlinks.data);
        
        // 2. Create an array of valid paths
        const validPaths: string[] = [];
        // Convert Map-like structure to entries and iterate
        const entries = this.backlinks.data instanceof Map ? 
            Array.from(this.backlinks.data) : 
            Object.entries(this.backlinks.data);
            
        for (const [pathAsKey, backlinkArray] of entries) {
            // console.log('Processing path:', pathAsKey);
            // console.log('Backlink array:', backlinkArray);
            // console.log('Current file path:', this.file.path);
            // console.log('Is includable source:', await this.api.isIncludableSource(pathAsKey));
            
            const isIncludable = await this.api.isIncludableSource(pathAsKey);
            if (pathAsKey !== this.file.path && isIncludable) {
                validPaths.push(pathAsKey);
                // console.log('Added valid path:', pathAsKey);
            } else {
                console.log('Path rejected because:', {
                    isSameAsCurrentFile: pathAsKey === this.file.path,
                    isIncludableSource: isIncludable
                });
            }
        }
        // console.log('Valid paths collected:', validPaths);

        // 3. Convert those paths to TFile objects
        const backlinksAsFiles = validPaths.map((pathAsKey) => this.api.getFileByPath(pathAsKey));
        // console.log('Converted to TFiles:', backlinksAsFiles);

        // 4. Create InlinkingFile objects & do the summary calls
        const inlinkingFilesNew: InlinkingFile[] = [];
        await Promise.all(backlinksAsFiles.map(async (file) => {
            // console.log('Processing file for InlinkingFile:', file?.path);
            const inlinkingFile = new InlinkingFile(file, this.api);
            await inlinkingFile.makeSummary(this);
            inlinkingFilesNew.push(inlinkingFile);
        }));
        // console.log('Created InlinkingFiles:', inlinkingFilesNew);

        // 5. Store them on this.inlinkingFiles
        this.inlinkingFiles = inlinkingFilesNew;
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


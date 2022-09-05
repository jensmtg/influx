import { App, TFile, CachedMetadata, LinkCache, MarkdownRenderer } from 'obsidian';

export type BacklinksObject = { data: { [key: string]: LinkCache[] } }

export class ApiAdapter {
    app: App;

    constructor(app: App) {
        this.app = app
    }

    getFileByPath (path: string): TFile {
        const file = this.app.vault.getAbstractFileByPath(path)
        if (file instanceof TFile) {
            return file
        }
    }

    async readFile (file: TFile): Promise<string> {
        return await this.app.vault.read(file)
    }

    getMetadata (file: TFile): CachedMetadata {
        return this.app.metadataCache.getFileCache(file);
    }

    getBacklinks (file: TFile): BacklinksObject {
        // getBacklinksForFile is not document officially, so it might break at some point.
        // @ts-ignore
        return this.app.metadataCache.getBacklinksForFile(file)
    }

    async renderMarkdown (markdown: string): Promise<HTMLDivElement> {
        const div = document.createElement('div');
		await MarkdownRenderer.renderMarkdown(markdown, div, '/', null)
		return div
    }

    getSettings () {
        // @ts-ignore
        const settings = this.app.plugins?.plugins?.influx?.settings || {}
        return settings
    }
}
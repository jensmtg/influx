import type { TFile, WorkspaceLeaf, Editor, MarkdownView, MarkdownFileInfo, EventRef } from 'obsidian';
import type { ObsidianInfluxSettings } from '../../types';
import type { InfluxFileApi } from '../../domain/backlinks/influx-file';
import type { InfluxUiPlugin } from '../../ui/influx-ui-plugin';

interface SidebarWorkspaceBridge {
	getActiveFile: () => TFile | null;
	getActiveViewOfType: (type: typeof MarkdownView) => MarkdownView | null;
	on(name: 'active-leaf-change', callback: (leaf: WorkspaceLeaf | null) => void): EventRef;
	on(name: 'file-open', callback: (file: TFile | null) => void): EventRef;
	on(name: 'editor-change', callback: (editor: Editor, info: MarkdownView | MarkdownFileInfo) => void): EventRef;
}

interface InfluxSidebarApi extends InfluxFileApi {
	invalidateFileCache: (path: string) => void;
}

export interface InfluxSidebarPlugin extends InfluxUiPlugin {
	data: { settings: ObsidianInfluxSettings };
	api: InfluxSidebarApi;
	app: {
		workspace: SidebarWorkspaceBridge;
	};
}

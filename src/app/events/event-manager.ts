import { TAbstractFile, TFile, WorkspaceLeaf, View } from 'obsidian';
import type ObsidianInflux from '../app/InfluxPlugin';
import { recordMetric } from '../platform/diagnostics/metrics';

type ModeLabel = 'preview' | 'editor' | 'other';
type InfluxView = View & {
	currentMode?: { type?: string };
	mode?: string;
	file?: TFile;
};

/**
 * Manages Obsidian event registration for file modifications, renames, deletions,
 * and workspace layout changes. Triggers plugin updates when relevant events occur.
 */
export class EventManager {
	private lastMode: ModeLabel | null = null;

	constructor(private plugin: ObsidianInflux) {}

	register(): void {
		this.plugin.registerEvent(
			this.plugin.app.vault.on('modify', this.handleModify.bind(this))
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on('rename', this.handleRename.bind(this))
		);
		this.plugin.registerEvent(
			this.plugin.app.vault.on('delete', this.handleDelete.bind(this))
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('file-open', this.handleFileOpen.bind(this))
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('layout-change', this.handleLayoutChange.bind(this))
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', this.handleActiveLeafChange.bind(this))
		);
	}

	private handleModify(file: TAbstractFile): void {
		// Only process files, skip folders
		if (!(file instanceof TFile)) {
			return;
		}

		this.plugin.api.invalidateFileCache(file.path);
		if (this.plugin.data.settings.liveUpdate) {
			this.plugin.triggerUpdates('modify', file);
		}
	}

	private handleRename(file: TAbstractFile, oldPath?: string): void {
		if (file instanceof TFile) {
			if (oldPath && oldPath !== file.path) {
				this.plugin.api.invalidateFileCache(oldPath);
				this.plugin.cleanupFileHash(oldPath);
			}
			this.plugin.api.invalidateFileCache(file.path);
			this.plugin.cleanupFileHash(file.path);
		}
		this.plugin.triggerUpdates('rename', file);
	}

	private handleDelete(file: TAbstractFile): void {
		if (file instanceof TFile) {
			this.plugin.api.invalidateFileCache(file.path);
			this.plugin.cleanupFileHash(file.path);
		}
		this.plugin.triggerUpdates('delete', file);
	}

	private handleFileOpen(file: TAbstractFile): void {
		// Only trigger updates for files that exist and are not folders
		if (!file || !(file instanceof TFile)) {
			return;
		}
		this.plugin.triggerUpdates('file-open', file);
	}

	private handleLayoutChange(): void {
		this.plugin.cleanupReactRoots();
		this.plugin.triggerUpdates('layout-change');
	}

	private handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
		const nextMode = this.detectMode(leaf);
		if (!nextMode || nextMode === this.lastMode) {
			return;
		}
		const previousMode = this.lastMode;

		recordMetric({
			name: 'influx.mode.change',
			mode: 'shared',
			durationMs: 0,
			always: true,
			settings: this.plugin.data.settings,
			ctx: {
				fromMode: previousMode ?? 'none',
				toMode: nextMode,
			}
		});

		this.lastMode = nextMode;
		if (this.shouldRefreshForModeChange(previousMode, nextMode)) {
			const activeFile = this.getLeafFile(leaf);
			this.plugin.triggerUpdates('mode-change', activeFile);
		}
	}

	private detectMode(leaf: WorkspaceLeaf | null): ModeLabel | null {
		const view = leaf?.view as InfluxView | undefined;
		if (!view) {
			return null;
		}

		const explicitMode = view.currentMode?.type || view.mode;
		if (explicitMode === 'preview') {
			return 'preview';
		}
		if (explicitMode === 'source' || explicitMode === 'live') {
			return 'editor';
		}

		const viewType = typeof view.getViewType === 'function' ? view.getViewType() : '';
		if (viewType === 'markdown') {
			return 'editor';
		}

		return 'other';
	}

	private shouldRefreshForModeChange(previousMode: ModeLabel | null, nextMode: ModeLabel): boolean {
		if (!previousMode || previousMode === nextMode) {
			return false;
		}
		const isRenderableMode = (mode: ModeLabel) => mode === 'editor' || mode === 'preview';
		return isRenderableMode(previousMode) && isRenderableMode(nextMode);
	}

	private getLeafFile(leaf: WorkspaceLeaf | null): TFile | undefined {
		const view = leaf?.view as InfluxView | undefined;
		if (!view?.file) {
			return undefined;
		}
		return view.file instanceof TFile ? view.file : undefined;
	}
}

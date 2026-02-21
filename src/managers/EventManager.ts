import { TAbstractFile, TFile } from 'obsidian';
import type ObsidianInflux from '../main';

/**
 * Manages Obsidian event registration for file modifications, renames, deletions,
 * and workspace layout changes. Triggers plugin updates when relevant events occur.
 */
export class EventManager {
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
	}

	private handleModify(file: TAbstractFile): void {
		if (!this.plugin.data.settings.liveUpdate) {
			return;
		}
		// Only process files, skip folders
		if (!(file instanceof TFile)) {
			return;
		}
		this.plugin.api.invalidateFileCache(file.path);
		this.plugin.triggerUpdates('modify', file);
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
}

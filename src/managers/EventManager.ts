import { TAbstractFile, TFile } from 'obsidian';
import type ObsidianInflux from '../main';

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
		if (file instanceof TFile) {
			this.plugin.api.invalidateFileCache(file.path);
		}
		this.plugin.triggerUpdates('modify', file);
	}

	private handleRename(file: TAbstractFile): void {
		if (file instanceof TFile) {
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
		this.plugin.triggerUpdates('file-open', file);
	}

	private handleLayoutChange(): void {
		this.plugin.cleanupReactRoots();
		this.plugin.triggerUpdates('layout-change');
	}
}

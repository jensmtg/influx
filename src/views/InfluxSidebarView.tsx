import { ItemView, TFile, WorkspaceLeaf, Editor, MarkdownView, MarkdownFileInfo } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import type ObsidianInflux from '../main';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../constants';

export class InfluxSidebarView extends ItemView {
	private currentFile: TFile | null = null;
	private influxFile: InfluxFile | null = null;
	private root: Root | null = null;
	private plugin: ObsidianInflux;
	private componentKey: string = 'initial';

	constructor(leaf: WorkspaceLeaf, plugin: ObsidianInflux) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return CONSTANTS.VIEW_TYPE_SIDEBAR;
	}

	getDisplayText(): string {
		return 'Influx';
	}

	getIcon(): string {
		return 'links-coming-in';
	}

	async onOpen(): Promise<void> {
		logger.info('InfluxSidebarView opened');

		try {
			this.root = createRoot(this.containerEl);
			this.registerFileEvents();

			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				await this.updateView(activeFile);
			}
		} catch (error) {
			logger.error('Failed to open InfluxSidebarView', { error });
		}
	}

	async onClose(): Promise<void> {
		logger.info('InfluxSidebarView closed');

		if (this.root) {
			try {
				this.root.unmount();
			} catch (error) {
				logger.error('Failed to unmount React root', { error });
			}
			this.root = null;
		}

		this.currentFile = null;
		this.influxFile = null;
	}

	private registerFileEvents(): void {
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				const view = leaf?.view;
				if (view instanceof MarkdownView && view.file) {
					const file = view.file;
					if (file !== this.currentFile) {
						this.updateView(file);
					}
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file && file !== this.currentFile) {
					this.updateView(file);
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
				const file = (info as MarkdownView).file || (info as MarkdownFileInfo).file;
				if (file && file === this.currentFile && this.plugin.data.settings.liveUpdate) {
					this.handleEditorChange();
				}
			})
		);
	}

	async updateView(file: TFile): Promise<void> {
		if (!file) {
			return;
		}

		if (file === this.currentFile) {
			return;
		}

		logger.debug('Updating Influx sidebar view', { filePath: file.path });

		this.currentFile = file;

		try {
			this.influxFile = await InfluxFile.create(file.path, this.plugin.api);
			await this.influxFile.makeInfluxList();
			await this.influxFile.renderAllMarkdownBlocks();

			if (this.root) {
				this.componentKey = `${file.path}-${Date.now()}`;
				this.root.render(
					<InfluxReactComponent
						key={this.componentKey}
						influxFile={this.influxFile}
						preview={true}
						plugin={this.plugin}
					/>
				);
			}
		} catch (error) {
			logger.error('Failed to update sidebar view', { filePath: file.path, error });
		}
	}

	private async handleEditorChange(): Promise<void> {
		if (!this.influxFile || !this.currentFile) {
			return;
		}

		try {
			this.plugin.api.invalidateFileCache(this.currentFile.path);
			await this.influxFile.makeInfluxList();
			await this.influxFile.renderAllMarkdownBlocks();

			if (this.root) {
				this.componentKey = `${this.currentFile.path}-${Date.now()}`;
				this.root.render(
					<InfluxReactComponent
						key={this.componentKey}
						influxFile={this.influxFile}
						preview={true}
						plugin={this.plugin}
					/>
				);
			}
		} catch (error) {
			logger.error('Failed to handle editor change', { filePath: this.currentFile.path, error });
		}
	}
}

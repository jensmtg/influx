import { ItemView, TFile, WorkspaceLeaf, Editor, MarkdownView, MarkdownFileInfo } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../components/ui/InfluxReactComponent';
import type ObsidianInflux from '../app/InfluxPlugin';
import { logger } from '../utils/logger';
import { CONSTANTS } from '../constants';
import { recordMetric } from '../utils/metrics';

export class InfluxSidebarView extends ItemView {
	private currentFile: TFile | null = null;
	private influxFile: InfluxFile | null = null;
	private root: Root | null = null;
	private plugin: ObsidianInflux;
	private componentKey: string = 'initial';
	private currentUpdateId: number = 0;
	private abortController: AbortController | null = null;

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

		// Cancel any pending updates
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

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
				const file = (view as MarkdownView)?.file;
				if (file && file !== this.currentFile) {
					this.updateView(file);
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

		// Cancel any previous ongoing update
		if (this.abortController) {
			this.abortController.abort();
		}

		// Create new abort controller for this update
		this.abortController = new AbortController();
		const signal = this.abortController.signal;
		const updateId = ++this.currentUpdateId;

		this.currentFile = file;
		this.componentKey = file.path;

		try {
			const pipelineStart = performance.now();
			this.influxFile = await InfluxFile.create(file.path, this.plugin.api);

			// Check if this update is still current
			if (signal.aborted || updateId !== this.currentUpdateId) {
				return;
			}

			if (!this.influxFile.show) {
				recordMetric({
					name: 'influx.pipeline.total',
					mode: 'sidebar',
					durationMs: performance.now() - pipelineStart,
					settings: this.plugin.data.settings,
					always: true,
					ctx: {
						filePath: file.path,
						show: false,
						listLimit: this.plugin.data.settings.listLimit || 0,
						totalEntryCount: 0,
						renderedCount: 0
					}
				});
				this.root?.render(null);
				return;
			}

			await this.influxFile.makeInfluxList();

			// Check again before continuing
			if (signal.aborted || updateId !== this.currentUpdateId) {
				return;
			}

			const renderedComponents = this.influxFile.toEntries();
			recordMetric({
				name: 'influx.pipeline.total',
				mode: 'sidebar',
				durationMs: performance.now() - pipelineStart,
				settings: this.plugin.data.settings,
				always: true,
				ctx: {
					filePath: file.path,
					show: this.influxFile.show,
					listLimit: this.plugin.data.settings.listLimit || 0,
					totalEntryCount: this.influxFile.totalEntryCount,
					renderedCount: renderedComponents.length
				}
			});

			// Final check before rendering
			if (signal.aborted || updateId !== this.currentUpdateId) {
				return;
			}

			if (this.root) {
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
			// Don't log errors if this operation was aborted
			if (signal.aborted) {
				return;
			}
			logger.error('Failed to update sidebar view', { filePath: file.path, error });
			// Provide user feedback in UI
			if (this.root) {
				this.root.render(
					<div style={{
						padding: '1rem',
						color: 'var(--text-error)',
						textAlign: 'center'
					}}>
						Failed to load Influx. Check console for details.
					</div>
				);
			}
		}
	}

	private async handleEditorChange(): Promise<void> {
		if (!this.influxFile || !this.currentFile) {
			return;
		}

		const signal = this.abortController?.signal;
		const updateId = this.currentUpdateId;

		try {
			const pipelineStart = performance.now();
			const shouldShow = this.plugin.api.getShowStatus(this.currentFile);
			this.influxFile.show = shouldShow;
			if (!shouldShow) {
				recordMetric({
					name: 'influx.pipeline.total',
					mode: 'sidebar',
					durationMs: performance.now() - pipelineStart,
					settings: this.plugin.data.settings,
					always: true,
					ctx: {
						filePath: this.currentFile.path,
						show: false,
						listLimit: this.plugin.data.settings.listLimit || 0,
						totalEntryCount: 0,
						renderedCount: 0
					}
				});
				this.root?.render(null);
				return;
			}

			this.plugin.api.invalidateFileCache(this.currentFile.path);
			await this.influxFile.makeInfluxList();

			if (signal?.aborted || updateId !== this.currentUpdateId) {
				return;
			}

			const renderedComponents = this.influxFile.toEntries();
			recordMetric({
				name: 'influx.pipeline.total',
				mode: 'sidebar',
				durationMs: performance.now() - pipelineStart,
				settings: this.plugin.data.settings,
				always: true,
				ctx: {
					filePath: this.currentFile.path,
					show: this.influxFile.show,
					listLimit: this.plugin.data.settings.listLimit || 0,
					totalEntryCount: this.influxFile.totalEntryCount,
					renderedCount: renderedComponents.length
				}
			});

			if (signal?.aborted || updateId !== this.currentUpdateId) {
				return;
			}

			if (this.root) {
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
			if (signal?.aborted) {
				return;
			}
			logger.error('Failed to handle editor change', { filePath: this.currentFile.path, error });
			// Provide user feedback in UI - temporarily show error message
			if (this.root && this.influxFile) {
				const currentComponent = (
					<InfluxReactComponent
						key={this.componentKey}
						influxFile={this.influxFile}
						preview={true}
						plugin={this.plugin}
					/>
				);
				this.root.render(
					<div>
						<div style={{
							padding: '0.5rem',
							color: 'var(--text-warning)',
							fontSize: '0.9em',
							background: 'var(--background-modifier-hover)',
							borderBottom: '1px solid var(--background-modifier-border)'
						}}>
							Failed to update Influx. Retrying...
						</div>
						{currentComponent}
					</div>
				);
			}
		}
	}
}

import { ItemView, TFile, WorkspaceLeaf, Editor, MarkdownView, MarkdownFileInfo } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import InfluxFile from '../../domain/backlinks/influx-file';
import InfluxReactComponent from '../../ui/influx-react-component';
import type ObsidianInflux from '../../app/influx-plugin';
import { logger } from '../../platform/diagnostics/logger';
import { CONSTANTS } from '../../config/constants';
import { recordMetric } from '../../platform/diagnostics/metrics';
import { influxUpdates$, InfluxUpdateEvent } from '../../app/events/influx-updates';

export class InfluxSidebarView extends ItemView {
	private static nextSubscriptionId = 1;
	private currentFile: TFile | null = null;
	private influxFile: InfluxFile | null = null;
	private root: Root | null = null;
	private plugin: ObsidianInflux;
	private componentKey: string = 'initial';
	private currentUpdateId: number = 0;
	private abortController: AbortController | null = null;
	private updatesUnsubscribe: (() => void) | null = null;
	private readonly updatesSubscriptionId = `sidebar-${InfluxSidebarView.nextSubscriptionId++}`;

	private renderStatusState(params: {
		title: string;
		detail?: string;
		variant: 'loading' | 'empty' | 'warning' | 'error';
	}): void {
		if (!this.root) {
			return;
		}
		this.root.render(
			<div className={`influx-sidebar-status influx-sidebar-status--${params.variant}`}>
				<div className="influx-sidebar-status-eyebrow">Influx</div>
				<div className="influx-sidebar-status-title">{params.title}</div>
				{params.detail && (
					<div className="influx-sidebar-status-detail">{params.detail}</div>
				)}
			</div>
		);
	}

	private clearCurrentState(): void {
		this.currentFile = null;
		this.influxFile = null;
		this.componentKey = 'initial';
	}

	private renderIdleState(): void {
		this.clearCurrentState();
		this.renderStatusState({
			title: 'Open a note to explore linked mentions',
			detail: 'Influx will keep this sidebar focused on the active markdown note.',
			variant: 'empty',
		});
	}

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
			this.registerSharedUpdates();

			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				await this.updateView(activeFile);
			} else {
				this.renderIdleState();
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

		this.updatesUnsubscribe?.();
		this.updatesUnsubscribe = null;

		this.currentFile = null;
		this.influxFile = null;
	}

	private registerSharedUpdates(): void {
		this.updatesUnsubscribe?.();
		this.updatesUnsubscribe = influxUpdates$.subscribe(this.updatesSubscriptionId, (event) => {
			void this.handleSharedUpdate(event);
		});
	}

	private async handleSharedUpdate(event: InfluxUpdateEvent): Promise<void> {
		if (!this.currentFile) {
			return;
		}

		if (event.op === 'layout-change' || event.op === 'file-open') {
			return;
		}

		if ((event.op === 'modify' || event.op === 'rename' || event.op === 'delete') && !event.file) {
			return;
		}

		const currentFile = this.currentFile;
		const touchesCurrentFile = event.file?.path === currentFile.path;
		const affectsBacklinks = event.file ? (this.influxFile?.shouldUpdate(event.file) ?? false) : false;
		const shouldRefresh = event.op === 'save-settings' || event.op === 'mode-change'
			? true
			: touchesCurrentFile || affectsBacklinks;

		if (!shouldRefresh) {
			return;
		}

		await this.updateView(currentFile, { force: true });
	}

	private registerFileEvents(): void {
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				const view = leaf?.view;
				const file = (view as MarkdownView)?.file;
				if (file && file !== this.currentFile) {
					this.updateView(file);
					return;
				}
				if (!file) {
					this.renderIdleState();
				}
			})
		);

		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file && file !== this.currentFile) {
					this.updateView(file);
					return;
				}
				if (!file) {
					this.renderIdleState();
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

	async updateView(file: TFile, options?: { force?: boolean }): Promise<void> {
		if (!file) {
			return;
		}

		if (!options?.force && file === this.currentFile) {
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
		this.renderStatusState({
			title: 'Loading linked mentions',
			detail: `Scanning backlinks for ${file.basename}.`,
			variant: 'loading',
		});

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
				this.renderStatusState({
					title: 'Nothing to show for this note yet',
					detail: 'This note is currently hidden by your Influx rules or has no eligible linked mentions.',
					variant: 'empty',
				});
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
			this.renderStatusState({
				title: 'Influx could not load this sidebar view',
				detail: 'Try switching notes, then reopen the Influx sidebar if the problem sticks around.',
				variant: 'error',
			});
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
			if (signal?.aborted || updateId !== this.currentUpdateId) {
				return;
			}
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
				this.renderStatusState({
					title: 'Linked mentions are hidden for this note',
					detail: 'Your current filters or show rules are hiding Influx in the sidebar right now.',
					variant: 'empty',
				});
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
			if (updateId !== this.currentUpdateId) {
				return;
			}
			logger.error('Failed to handle editor change', { filePath: this.currentFile.path, error });
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
					<div className="influx-sidebar-stack">
						<div className="influx-sidebar-status influx-sidebar-status--warning">
							<div className="influx-sidebar-status-eyebrow">Influx</div>
							<div className="influx-sidebar-status-title">Sidebar refresh failed</div>
							<div className="influx-sidebar-status-detail">Keep editing and Influx will retry on the next relevant change.</div>
						</div>
						{currentComponent}
					</div>
				);
			}
		}
	}
}

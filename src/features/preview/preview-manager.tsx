import { WorkspaceLeaf, MarkdownPostProcessorContext } from 'obsidian';
import { ApiAdapter } from '../../domain/backlinks/api-adapter';
import { rootManager } from '../../platform/react/root-manager';
import { logger } from '../../platform/diagnostics/logger';
import InfluxFile from '../../domain/backlinks/influx-file';
import InfluxReactComponent from '../../ui/influx-react-component';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import type ObsidianInflux from '../../app/influx-plugin';
import { computeSettingsHash } from '../../domain/settings/settings-hash';
import { cacheManager } from '../../platform/cache/cache-manager';
import { recordMetric } from '../../platform/diagnostics/metrics';
import { CONSTANTS } from '../../config/constants';
import {
	cleanupAllPreviewRootsAndContainers,
	cleanupDuplicatePreviewWrappers,
	cleanupPreviewContainers,
	findExistingContainer,
	leafHasPreviewRoot,
	type InfluxWorkspaceLeaf,
	isLeafInPreviewMode,
	resolvePreviewRoot,
} from './preview-manager-dom';

/**
 * Manages Influx plugin rendering in preview mode. Handles container creation,
 * React root management, and cache invalidation.
 */
export class PreviewManager {
	private static readonly PREVIEW_ROOT_RETRY_MS = 75;
	private static readonly POST_PROCESS_REFRESH_DELAY_MS = 80;
	private leafContainerIds = new WeakMap<HTMLDivElement, number>();
	private nextLeafContainerId = 1;
	private postProcessRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private disposed = false;

	constructor(
		private plugin: ObsidianInflux,
		private apiAdapter: ApiAdapter
	) {}

	dispose(): void {
		this.disposed = true;
		for (const timer of this.postProcessRefreshTimers.values()) {
			clearTimeout(timer);
		}
		this.postProcessRefreshTimers.clear();
	}

	async updateAllPreviews(): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		if (this.plugin.data.settings.showInfluxInSidebar) {
			cleanupAllPreviewRootsAndContainers();
			return;
		}

		const previewLeaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			if (leafHasPreviewRoot(influxLeaf)) {
				previewLeaves.push(leaf);
			}
		});

		const updatePromises = previewLeaves.map((leaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const filePath = influxLeaf.view?.file?.path;
			if (!filePath) {
				return Promise.resolve();
			}
			const updateKey = this.getLeafUpdateKey(influxLeaf, filePath);

			const now = Date.now();
			const lastUpdate = this.plugin.updating.get(updateKey);
			if (lastUpdate && now - lastUpdate < 1000) {
				return Promise.resolve();
			}
			this.plugin.updating.set(updateKey, now);

			return this.updatePreview(leaf)
				.catch((error) => {
					logger.error('Failed to update preview', { filePath, error });
				})
				.finally(() => {
					this.plugin.updating.delete(updateKey);
				});
		});

		await Promise.all(updatePromises);
	}

	async updatePreview(leaf: WorkspaceLeaf): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl;
		const path = influxLeaf.view?.file?.path;
		if (!path) {
			logger.debug('No file path found for preview');
			return;
		}

		const settings = this.plugin.data.settings;
		const previewDiv = await this.resolvePreviewDiv(container, isLeafInPreviewMode(influxLeaf));
		if (!previewDiv) {
			logger.debug('Preview root not ready for leaf', { filePath: path });
			return;
		}
		if (settings.showInfluxInSidebar) {
			cleanupPreviewContainers(previewDiv);
			return;
		}

		const pipelineStart = performance.now();

		const existingContainer = findExistingContainer(previewDiv);
		cleanupDuplicatePreviewWrappers(previewDiv, existingContainer);

		const fileMtime = influxLeaf.view?.file?.stat?.mtime ?? 0;
		const fileHash = `${path}-${fileMtime}-${this.computeSettingsHash()}`;

		if (
			existingContainer &&
			cacheManager.getPreviewFileHash(path) === fileHash &&
			rootManager.has(existingContainer)
		) {
			return;
		}

		// Clean up only the existing root for this preview container.
		// This avoids clobbering parallel panes showing the same file.
		if (existingContainer) {
			rootManager.unmountDeferred(existingContainer);
		}

		const influxFile = await InfluxFile.create(path, this.apiAdapter);
		if (!influxFile.show) {
			cleanupPreviewContainers(previewDiv);
			recordMetric({
				name: 'influx.pipeline.total',
				mode: 'preview',
				durationMs: performance.now() - pipelineStart,
				settings,
				always: true,
				ctx: {
					filePath: path,
					show: false,
					listLimit: settings.listLimit || 0,
					totalEntryCount: 0,
					renderedCount: 0
				}
			});
			return;
		}

		await influxFile.makeInfluxList();
		const renderedComponents = influxFile.toEntries();
		recordMetric({
			name: 'influx.pipeline.total',
			mode: 'preview',
			durationMs: performance.now() - pipelineStart,
			settings,
			always: true,
			ctx: {
				filePath: path,
				show: influxFile.show,
				listLimit: settings.listLimit || 0,
				totalEntryCount: influxFile.totalEntryCount,
				renderedCount: renderedComponents.length
			}
		});

		cacheManager.setPreviewFileHash(path, fileHash);

		let anchor: Root | undefined;

		if (existingContainer) {
			// Reuse existing container
			const info = rootManager.get(existingContainer);
			if (info) {
				anchor = info.root;
			} else {
				// Container exists but root is not tracked (possible stale React marker).
				// Replace node to guarantee a fresh createRoot target.
				const replacementContainer = document.createElement(CONSTANTS.INFLUX_CONTAINER_TAG);
				replacementContainer.id = influxFile.uuid;
				existingContainer.replaceWith(replacementContainer);
				anchor = createRoot(replacementContainer);
				rootManager.register(replacementContainer, anchor, 'preview', path);
				logger.debug('Replaced untracked preview container before root creation', { filePath: path });
			}
		} else {
			// Clean up any orphaned containers and wrappers
			cleanupPreviewContainers(previewDiv);

			// Create new container
			const influxWrapper = document.createElement('div');
			influxWrapper.className = CONSTANTS.INFLUX_WRAPPER_CLASS;

			const influxContainer = document.createElement(CONSTANTS.INFLUX_CONTAINER_TAG);
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);

			const currentSettings = this.plugin.data.settings;
			if (currentSettings.influxAtTopOfPage) {
				previewDiv.insertBefore(influxWrapper, previewDiv.firstChild);
			} else {
				previewDiv.appendChild(influxWrapper);
			}

			anchor = createRoot(influxContainer);
			rootManager.register(influxContainer, anchor, 'preview', path);
		}

		anchor.render(
			<InfluxReactComponent influxFile={influxFile} preview={true} plugin={this.plugin} />
		);
	}

	async handlePreviewMode(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		const filePath = context.sourcePath;
		if (!filePath) {
			return;
		}

		const settings = this.plugin.data.settings;

		const previewRoot = resolvePreviewRoot(element);
		if (!previewRoot) {
			if (!settings.showInfluxInSidebar) {
				logger.debug('[handlePreviewMode] Preview root not ready yet; scheduling retry', { filePath });
				this.schedulePreviewRefreshForPath(filePath);
			}
			return;
		}
		if (settings.showInfluxInSidebar) {
			cleanupPreviewContainers(previewRoot);
			return;
		}

		logger.debug('[handlePreviewMode] Scheduling preview refresh', { filePath });
		this.schedulePreviewRefreshForPath(filePath);
	}

	private schedulePreviewRefreshForPath(filePath: string): void {
		if (this.isInactive()) {
			return;
		}

		const pending = this.postProcessRefreshTimers.get(filePath);
		if (pending) {
			clearTimeout(pending);
		}

		const timer = setTimeout(() => {
			if (this.isInactive()) {
				this.postProcessRefreshTimers.delete(filePath);
				return;
			}
			this.postProcessRefreshTimers.delete(filePath);
			void this.refreshPreviewLeavesByPath(filePath);
		}, PreviewManager.POST_PROCESS_REFRESH_DELAY_MS);
		this.postProcessRefreshTimers.set(filePath, timer);
	}

	private async refreshPreviewLeavesByPath(filePath: string): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		const leaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafPath = influxLeaf.view?.file?.path;
			if (leafPath !== filePath) {
				return;
			}

			if (!leafHasPreviewRoot(influxLeaf)) {
				return;
			}

			leaves.push(leaf);
		});

		await Promise.all(
			leaves.map((leaf) => this.updatePreview(leaf).catch((error) => {
				logger.error('Failed to refresh preview leaf from post-processor', { filePath, error });
			}))
		);
	}

	private isInactive(): boolean {
		return this.disposed || this.plugin.isUnloading;
	}

	private getLeafUpdateKey(leaf: InfluxWorkspaceLeaf, filePath: string): string {
		return `${filePath}::${this.getLeafContainerId(leaf.containerEl)}`;
	}

	private getLeafContainerId(container: HTMLDivElement): number {
		const existing = this.leafContainerIds.get(container);
		if (existing) {
			return existing;
		}
		const next = this.nextLeafContainerId;
		this.nextLeafContainerId += 1;
		this.leafContainerIds.set(container, next);
		return next;
	}

	private async resolvePreviewDiv(container: HTMLElement, allowRetry: boolean): Promise<HTMLElement | null> {
		const getPreviewDiv = () => container.querySelector('.markdown-preview-view') as HTMLElement | null;
		const immediate = getPreviewDiv();
		if (immediate || !allowRetry) {
			return immediate;
		}

		await new Promise((resolve) => window.setTimeout(resolve, PreviewManager.PREVIEW_ROOT_RETRY_MS));
		return getPreviewDiv();
	}


    private computeSettingsHash(): string {
        // Return cached hash if available
        const cached = cacheManager.getSettingsHash();
        if (cached) {
            return cached;
        }

        const settings = this.plugin.data.settings;
        logger.debug('Computing settings hash', {
            settings: {
                sortingPrinciple: settings.sortingPrinciple,
                sortingAttribute: settings.sortingAttribute,
                sourceBehaviour: settings.sourceBehaviour,
                includeFrontmatterLinks: settings.includeFrontmatterLinks,
                frontmatterProperties: settings.frontmatterProperties,
                fontSize: settings.fontSize,
                collapseAllByDefault: settings.collapseAllByDefault,
                listLimit: settings.listLimit
            }
        });
        const hashString = computeSettingsHash(settings);
        cacheManager.setSettingsHash(hashString);
        logger.debug('Settings hash computed', { hash: hashString });
        return hashString;
    }
}

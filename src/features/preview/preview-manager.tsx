import { WorkspaceLeaf, MarkdownPostProcessorContext } from 'obsidian';
import { ApiAdapter } from '../../domain/backlinks/api-adapter';
import { rootManager } from '../../platform/react/root-manager';
import { logger } from '../../platform/diagnostics/logger';
import InfluxReactComponent from '../../ui/influx-react-component';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import type ObsidianInflux from '../../app/influx-plugin';
import { computeSettingsHash } from '../../domain/settings/settings-hash';
import { cacheManager } from '../../platform/cache/cache-manager';
import { CONSTANTS } from '../../config/constants';
import { createInfluxFileForRender } from '../../domain/backlinks/influx-render-pipeline';
import {
	cleanupAllPreviewRootsAndContainers,
	cleanupDuplicatePreviewWrappers,
	cleanupPreviewContainers,
	findExistingContainer,
	getLeafMarkdownFileMtime,
	getLeafMarkdownFilePath,
	leafHasPreviewRoot,
	type InfluxWorkspaceLeaf,
	isLeafInPreviewMode,
	resolveLeafPreviewRootFromLeaf,
	resolvePreviewRoot,
} from './preview-manager-dom';

/**
 * Manages Influx plugin rendering in preview mode. Handles container creation,
 * React root management, and cache invalidation.
 */
export class PreviewManager {
	private static readonly PREVIEW_ROOT_RETRY_MS = 75;
	private static readonly POST_PROCESS_REFRESH_DELAYS_MS = [80, 240, 640];
	private static readonly POST_RENDER_STABILIZATION_DELAY_MS = 160;
	private leafContainerIds = new WeakMap<HTMLDivElement, number>();
	private nextLeafContainerId = 1;
	private postProcessRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private postProcessRefreshRuns = new Map<string, number>();
	private postRenderStabilizationTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
		for (const timer of this.postRenderStabilizationTimers.values()) {
			clearTimeout(timer);
		}
		this.postProcessRefreshTimers.clear();
		this.postProcessRefreshRuns.clear();
		this.postRenderStabilizationTimers.clear();
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
			const filePath = getLeafMarkdownFilePath(influxLeaf);
			if (!filePath) {
				return Promise.resolve();
			}
			const updateKey = this.getLeafUpdateKey(influxLeaf, filePath);

			if (this.plugin.updating.has(updateKey)) {
				return Promise.resolve();
			}
			this.plugin.updating.add(updateKey);

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
		const path = getLeafMarkdownFilePath(influxLeaf);
		if (!path) {
			logger.debug('No file path found for preview');
			return;
		}

		const settings = this.plugin.data.settings;
		const previewDiv = await this.resolvePreviewDiv(influxLeaf, path, isLeafInPreviewMode(influxLeaf));
		if (!previewDiv) {
			logger.debug('Preview root not ready for leaf', { filePath: path });
			return;
		}
		if (settings.showInfluxInSidebar) {
			cleanupPreviewContainers(previewDiv);
			return;
		}

		let targetPreviewDiv = previewDiv;
		let existingContainer = findExistingContainer(targetPreviewDiv);
		cleanupDuplicatePreviewWrappers(previewDiv, existingContainer);

		const fileMtime = getLeafMarkdownFileMtime(influxLeaf);
		const dependencyRevision = cacheManager.getDependencyRevision();
		const fileHash = `${path}-${fileMtime}-${this.computeSettingsHash()}-${dependencyRevision}`;

		if (this.hasFreshPreviewRoot(path, fileHash, existingContainer)) {
			return;
		}

		// Clean up only the existing root for this preview container.
		// This avoids clobbering parallel panes showing the same file.
		if (existingContainer) {
			rootManager.unmountDeferred(existingContainer);
		}

		const result = await createInfluxFileForRender({
			filePath: path,
			api: this.apiAdapter,
			mode: 'preview',
			settings,
			shouldAbort: () => this.isInactive() || cacheManager.getDependencyRevision() !== dependencyRevision,
		});
		if (!result) {
			return;
		}
		if (cacheManager.getDependencyRevision() !== dependencyRevision) {
			return;
		}

		const { influxFile } = result;
		if (result.hidden) {
			cleanupPreviewContainers(targetPreviewDiv);
			return;
		}

		const latestPreviewDiv = resolveLeafPreviewRootFromLeaf(influxLeaf, path);
		if (!latestPreviewDiv) {
			logger.debug('Preview root disappeared before render', { filePath: path });
			return;
		}
		if (latestPreviewDiv !== targetPreviewDiv) {
			targetPreviewDiv = latestPreviewDiv;
			existingContainer = findExistingContainer(targetPreviewDiv);
			cleanupDuplicatePreviewWrappers(targetPreviewDiv, existingContainer);
		}
		if (this.hasFreshPreviewRoot(path, fileHash, existingContainer)) {
			return;
		}

		cacheManager.setPreviewFileHash(path, fileHash);
		const anchor = this.getOrCreatePreviewRoot(targetPreviewDiv, path, influxFile.uuid, existingContainer);

		anchor.render(
			<InfluxReactComponent influxFile={influxFile} preview={true} plugin={this.plugin} />
		);

		if (!existingContainer || !rootManager.has(existingContainer)) {
			this.schedulePostRenderStabilizationRefresh(path);
		}
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
				this.schedulePreviewRefreshForPath(filePath);
			}
			return;
		}
		if (settings.showInfluxInSidebar) {
			cleanupPreviewContainers(previewRoot);
			return;
		}

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

		const runId = (this.postProcessRefreshRuns.get(filePath) ?? 0) + 1;
		this.postProcessRefreshRuns.set(filePath, runId);
		this.schedulePreviewRefreshAttempt(filePath, runId, 0);
	}

	private clearScheduledRefresh(filePath: string, clearRun = false): void {
		this.postProcessRefreshTimers.delete(filePath);
		if (clearRun) {
			this.postProcessRefreshRuns.delete(filePath);
		}
	}

	private schedulePostRenderStabilizationRefresh(filePath: string): void {
		if (this.isInactive()) {
			return;
		}

		const pending = this.postRenderStabilizationTimers.get(filePath);
		if (pending) {
			clearTimeout(pending);
		}

		const timer = setTimeout(() => {
			this.postRenderStabilizationTimers.delete(filePath);
			if (this.isInactive()) {
				return;
			}

			void this.refreshPreviewLeavesByPath(filePath).catch((error) => {
				logger.error('Failed to stabilize preview leaf after render', { filePath, error });
			});
		}, PreviewManager.POST_RENDER_STABILIZATION_DELAY_MS);

		this.postRenderStabilizationTimers.set(filePath, timer);
	}

	private schedulePreviewRefreshAttempt(filePath: string, runId: number, delayIndex: number): void {
		const delay = PreviewManager.POST_PROCESS_REFRESH_DELAYS_MS[delayIndex];
		const timer = setTimeout(() => {
			if (this.isInactive() || this.postProcessRefreshRuns.get(filePath) !== runId) {
				this.clearScheduledRefresh(filePath);
				return;
			}

			void this.refreshPreviewLeavesByPath(filePath).finally(() => {
				if (this.isInactive() || this.postProcessRefreshRuns.get(filePath) !== runId) {
					this.clearScheduledRefresh(filePath);
					return;
				}

				const nextDelayIndex = delayIndex + 1;
				if (nextDelayIndex >= PreviewManager.POST_PROCESS_REFRESH_DELAYS_MS.length) {
					this.clearScheduledRefresh(filePath, true);
					return;
				}

				this.schedulePreviewRefreshAttempt(filePath, runId, nextDelayIndex);
			});
		}, delay);

		this.postProcessRefreshTimers.set(filePath, timer);
	}

	private async refreshPreviewLeavesByPath(filePath: string): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		const leaves = this.getPreviewLeavesByPath(filePath);

		await Promise.all(
			leaves.map((leaf) => this.updatePreview(leaf).catch((error) => {
				logger.error('Failed to refresh preview leaf from post-processor', { filePath, error });
			}))
		);
	}

	private getPreviewLeavesByPath(filePath: string): WorkspaceLeaf[] {
		const leaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			if (getLeafMarkdownFilePath(influxLeaf) !== filePath || !leafHasPreviewRoot(influxLeaf)) {
				return;
			}

			leaves.push(leaf);
		});

		return leaves;
	}

	private hasFreshPreviewRoot(
		filePath: string,
		fileHash: string,
		existingContainer: HTMLElement | null
	): boolean {
		return Boolean(
			existingContainer &&
			cacheManager.getPreviewFileHash(filePath) === fileHash &&
			rootManager.has(existingContainer)
		);
	}

	private getOrCreatePreviewRoot(
		previewDiv: HTMLElement,
		filePath: string,
		containerId: string,
		existingContainer: HTMLElement | null
	): Root {
		if (existingContainer) {
			const info = rootManager.get(existingContainer);
			if (info) {
				return info.root;
			}

			const replacementContainer = document.createElement(CONSTANTS.INFLUX_CONTAINER_TAG);
			replacementContainer.id = containerId;
			existingContainer.replaceWith(replacementContainer);
			const root = createRoot(replacementContainer);
			rootManager.register(replacementContainer, root, 'preview', filePath);
			logger.debug('Replaced untracked preview container before root creation', { filePath });
			return root;
		}

		cleanupPreviewContainers(previewDiv);
		const previewContainer = this.createPreviewContainer(previewDiv, containerId);
		const root = createRoot(previewContainer);
		rootManager.register(previewContainer, root, 'preview', filePath);
		return root;
	}

	private createPreviewContainer(previewDiv: HTMLElement, containerId: string): HTMLElement {
		const influxWrapper = document.createElement('div');
		influxWrapper.className = CONSTANTS.INFLUX_WRAPPER_CLASS;

		const influxContainer = document.createElement(CONSTANTS.INFLUX_CONTAINER_TAG);
		influxContainer.id = containerId;
		influxWrapper.appendChild(influxContainer);

		if (this.plugin.data.settings.influxAtTopOfPage) {
			previewDiv.insertBefore(influxWrapper, previewDiv.firstChild);
		} else {
			previewDiv.appendChild(influxWrapper);
		}

		return influxContainer;
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

	private async resolvePreviewDiv(
		leaf: InfluxWorkspaceLeaf,
		filePath: string,
		allowRetry: boolean
	): Promise<HTMLElement | null> {
		const getPreviewDiv = () => resolveLeafPreviewRootFromLeaf(leaf, filePath);
		const immediate = getPreviewDiv();
		if (immediate || !allowRetry) {
			return immediate;
		}

		await new Promise((resolve) => window.setTimeout(resolve, PreviewManager.PREVIEW_ROOT_RETRY_MS));
		return getPreviewDiv();
	}
	private computeSettingsHash(): string {
		const cached = cacheManager.getSettingsHash();
		if (cached) {
			return cached;
		}

		const hashString = computeSettingsHash(this.plugin.data.settings);
		cacheManager.setSettingsHash(hashString);
		return hashString;
	}
}

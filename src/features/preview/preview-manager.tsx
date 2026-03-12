import { WorkspaceLeaf, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
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
	private static readonly PREVIEW_REFRESH_DELAY_MS = 120;
	private leafContainerIds = new WeakMap<HTMLDivElement, number>();
	private nextLeafContainerId = 1;
	private scheduledPreviewRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private disposed = false;

	constructor(
		private plugin: ObsidianInflux,
		private apiAdapter: ApiAdapter
	) {}

	dispose(): void {
		this.disposed = true;
		for (const timer of this.scheduledPreviewRefreshTimers.values()) {
			clearTimeout(timer);
		}
		this.scheduledPreviewRefreshTimers.clear();
	}

	async updateAllPreviews(): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		if (this.plugin.data.settings.showInfluxInSidebar) {
			cleanupAllPreviewRootsAndContainers();
			return;
		}

		const trackedPreviewContainers = new Set<HTMLElement>();
		const trackedPreviewUpdates = rootManager.getRootsByType('preview').map((info) => {
			if (!info.filePath) {
				return Promise.resolve();
			}

			const previewDiv = resolvePreviewRoot(info.container);
			if (!previewDiv) {
				return Promise.resolve();
			}

			trackedPreviewContainers.add(info.container);
			return this.renderPreviewForContainer({
				previewDiv,
				filePath: info.filePath,
				fileMtime: this.apiAdapter.getFileByPath(info.filePath)?.stat?.mtime ?? 0,
				preferredContainerId: info.container.id,
			}).catch((error) => {
				logger.error('Failed to update tracked preview root', { filePath: info.filePath, error });
			});
		});

		const previewLeaves = this.getUntrackedPreviewLeaves(trackedPreviewContainers);

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

		await Promise.all([...trackedPreviewUpdates, ...updatePromises]);
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
		const previewDiv = resolveLeafPreviewRootFromLeaf(influxLeaf, path);
		if (!previewDiv) {
			if (isLeafInPreviewMode(influxLeaf)) {
				this.schedulePreviewRefreshForPath(path);
			}
			logger.debug('Preview root not ready for leaf', { filePath: path });
			return;
		}
		if (settings.showInfluxInSidebar) {
			cleanupPreviewContainers(previewDiv);
			return;
		}

		await this.renderPreviewForContainer({
			previewDiv,
			filePath: path,
			fileMtime: getLeafMarkdownFileMtime(influxLeaf),
			resolveLatestPreviewDiv: () => resolveLeafPreviewRootFromLeaf(influxLeaf, path),
		});
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

		const host = this.ensurePostProcessorPreviewHost(previewRoot, context);
		const preferredContainerId = host.id || `influx-preview-host-${context.docId}`;

		try {
			await this.renderPreviewForContainer({
				previewDiv: previewRoot,
				filePath,
				fileMtime: this.apiAdapter.getFileByPath(filePath)?.stat?.mtime ?? 0,
				preferredContainerId,
			});
		} catch (error) {
			logger.error('Failed to render preview from post-processor host', { filePath, error });
			this.schedulePreviewRefreshForPath(filePath);
		}
	}

	private async renderPreviewForContainer(params: {
		previewDiv: HTMLElement;
		filePath: string;
		fileMtime: number;
		preferredContainerId?: string;
		resolveLatestPreviewDiv?: () => HTMLElement | null;
	}): Promise<void> {
		const { previewDiv, filePath, fileMtime, preferredContainerId, resolveLatestPreviewDiv } = params;
		if (this.isInactive()) {
			return;
		}

		const settings = this.plugin.data.settings;

		let targetPreviewDiv = previewDiv;
		let existingContainer = findExistingContainer(targetPreviewDiv);
		cleanupDuplicatePreviewWrappers(targetPreviewDiv, existingContainer);

		const dependencyRevision = cacheManager.getDependencyRevision();
		const fileHash = `${filePath}-${fileMtime}-${this.computeSettingsHash()}-${dependencyRevision}`;

		if (this.hasFreshPreviewRoot(filePath, fileHash, existingContainer)) {
			return;
		}

		if (existingContainer) {
			rootManager.unmountDeferred(existingContainer);
		}

		const result = await createInfluxFileForRender({
			filePath,
			api: this.apiAdapter,
			mode: 'preview',
			settings,
			shouldAbort: () => this.isInactive() || cacheManager.getDependencyRevision() !== dependencyRevision,
		});
		if (!result || cacheManager.getDependencyRevision() !== dependencyRevision) {
			return;
		}

		const { influxFile } = result;
		if (result.hidden) {
			cleanupPreviewContainers(targetPreviewDiv);
			return;
		}

		const latestPreviewDiv = resolveLatestPreviewDiv?.();
		if (resolveLatestPreviewDiv && !latestPreviewDiv) {
			logger.debug('Preview root disappeared before render', { filePath });
			return;
		}
		if (latestPreviewDiv && latestPreviewDiv !== targetPreviewDiv) {
			targetPreviewDiv = latestPreviewDiv;
			existingContainer = findExistingContainer(targetPreviewDiv);
			cleanupDuplicatePreviewWrappers(targetPreviewDiv, existingContainer);
		}
		if (this.hasFreshPreviewRoot(filePath, fileHash, existingContainer)) {
			return;
		}

		cacheManager.setPreviewFileHash(filePath, fileHash);
		const anchor = this.getOrCreatePreviewRoot(
			targetPreviewDiv,
			filePath,
			preferredContainerId ?? influxFile.uuid,
			existingContainer
		);

		anchor.render(
			<InfluxReactComponent influxFile={influxFile} preview={true} plugin={this.plugin} />
		);
	}

	private ensurePostProcessorPreviewHost(
		previewRoot: HTMLElement,
		context: MarkdownPostProcessorContext
	): HTMLElement {
		const existingContainer = findExistingContainer(previewRoot);
		if (existingContainer) {
			return existingContainer;
		}

		const container = this.createPreviewContainer(previewRoot, `influx-preview-host-${context.docId}`);
		context.addChild(new MarkdownRenderChild(container));
		return container;
	}

	private schedulePreviewRefreshForPath(filePath: string): void {
		if (this.isInactive()) {
			return;
		}

		if (this.scheduledPreviewRefreshTimers.has(filePath)) {
			return;
		}

		const timer = setTimeout(() => {
			this.scheduledPreviewRefreshTimers.delete(filePath);
			if (this.isInactive()) {
				return;
			}

			void this.refreshPreviewLeavesByPath(filePath).catch((error) => {
				logger.error('Failed scheduled preview refresh', { filePath, error });
			});
		}, PreviewManager.PREVIEW_REFRESH_DELAY_MS);

		this.scheduledPreviewRefreshTimers.set(filePath, timer);
	}

	private async refreshPreviewLeavesByPath(filePath: string): Promise<boolean> {
		if (this.isInactive()) {
			return false;
		}

		const trackedPreviewContainers = rootManager.getContainersByFilePath(filePath, 'preview');
		const trackedContainers = new Set<HTMLElement>(trackedPreviewContainers);
		let refreshedAny = false;

		if (trackedPreviewContainers.length > 0) {
			refreshedAny = true;
			const fileMtime = this.apiAdapter.getFileByPath(filePath)?.stat?.mtime ?? 0;
			await Promise.all(
				trackedPreviewContainers.map((container) => {
					const previewDiv = resolvePreviewRoot(container);
					if (!previewDiv) {
						return Promise.resolve();
					}

					return this.renderPreviewForContainer({
						previewDiv,
						filePath,
						fileMtime,
						preferredContainerId: container.id,
					}).catch((error) => {
						logger.error('Failed to refresh tracked preview host from post-processor', { filePath, error });
					});
				})
			);
		}

		const leaves = this.getUntrackedPreviewLeaves(trackedContainers, filePath);
		if (leaves.length === 0) {
			return refreshedAny;
		}

		refreshedAny = true;

		await Promise.all(
			leaves.map((leaf) => this.updatePreview(leaf).catch((error) => {
				logger.error('Failed to refresh preview leaf from post-processor', { filePath, error });
			}))
		);

		return refreshedAny;
	}

	private getUntrackedPreviewLeaves(
		trackedPreviewContainers: Set<HTMLElement>,
		filePath?: string
	): WorkspaceLeaf[] {
		const leaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafFilePath = getLeafMarkdownFilePath(influxLeaf);
			if ((!leafFilePath || (filePath && leafFilePath !== filePath)) || !leafHasPreviewRoot(influxLeaf)) {
				return;
			}

			const previewRoot = resolveLeafPreviewRootFromLeaf(influxLeaf, leafFilePath);
			const existingContainer = previewRoot ? findExistingContainer(previewRoot) : null;
			if (existingContainer && trackedPreviewContainers.has(existingContainer)) {
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

			existingContainer.id = existingContainer.id || containerId;
			existingContainer.replaceChildren();
			const root = createRoot(existingContainer);
			rootManager.register(existingContainer, root, 'preview', filePath);
			logger.debug('Attached root to existing preview container', { filePath });
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

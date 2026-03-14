import { WorkspaceLeaf, MarkdownPostProcessorContext, MarkdownRenderChild, requireApiVersion } from 'obsidian';
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
	getLeafPreviewModeRoot,
	rerenderLeafPreviewMode,
	type InfluxWorkspaceLeaf,
	isLeafInPreviewMode,
	resolvePreviewRoot,
} from './preview-manager-dom';
import { INFLUX_MARKDOWN_MOUNT_SELECTOR } from '../../ui/markdown-mount';

/**
 * Manages Influx plugin rendering in preview mode. Handles container creation,
 * React root management, and cache invalidation.
 */
export class PreviewManager {
	private static readonly PREVIEW_REFRESH_DELAY_MS = 120;
	private leafContainerIds = new WeakMap<HTMLDivElement, number>();
	private nextLeafContainerId = 1;
	private previewRenderOwnerIds = new WeakMap<HTMLElement, number>();
	private nextPreviewRenderOwnerId = 1;
	private postProcessorHosts = new Map<string, {
		filePath: string;
		previewRoot: HTMLElement;
		container: HTMLElement;
	}>();
	private inflightPostProcessorRenders = new Map<string, Promise<void>>();
	private latestPreviewRenderSeq = new Map<string, number>();
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
		this.postProcessorHosts.clear();
		this.inflightPostProcessorRenders.clear();
		this.latestPreviewRenderSeq.clear();
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

		const trackedPreviewHosts = this.getTrackedPreviewHosts();
		const trackedPreviewRoots = new Set<HTMLElement>();
		const trackedPreviewUpdates = trackedPreviewHosts.map(({ container, filePath, previewRoot }) => {
			trackedPreviewRoots.add(previewRoot);
			return this.renderPreviewForContainer({
				previewDiv: previewRoot,
				existingContainer: container,
				filePath,
				fileMtime: this.apiAdapter.getFileByPath(filePath)?.stat?.mtime ?? 0,
				preferredContainerId: container.id,
			}).catch((error) => {
				logger.error('Failed to update tracked preview root', { filePath, error });
			});
		});

		const previewLeaves = await this.getUntrackedPreviewLeaves(trackedPreviewRoots);

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

			return this.refreshUntrackedPreviewLeaf(influxLeaf, filePath)
				.catch((error) => {
					logger.error('Failed to update preview', { filePath, error });
				})
				.finally(() => {
					this.plugin.updating.delete(updateKey);
				});
		});

		await Promise.all([...trackedPreviewUpdates, ...updatePromises]);
	}

	async updatePreviewsForFilePath(filePath: string): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		await this.refreshPreviewLeavesByPath(filePath);
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
		const previewDiv = getLeafPreviewModeRoot(influxLeaf);
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

		const existingContainer = this.findTrackedPreviewContainer(path, previewDiv);
		if (!existingContainer) {
			if (rerenderLeafPreviewMode(influxLeaf)) {
				this.schedulePreviewRefreshForPath(path);
			} else {
				logger.debug('Preview leaf has no renderer-owned host to update', {
					filePath: path,
					hasExistingContainer: Boolean(findExistingContainer(previewDiv)),
				});
			}
			return;
		}

		await this.renderPreviewForContainer({
			previewDiv,
			existingContainer,
			filePath: path,
			fileMtime: getLeafMarkdownFileMtime(influxLeaf),
			resolveLatestPreviewDiv: () => getLeafPreviewModeRoot(influxLeaf),
		});
	}

	async handlePreviewMode(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
		if (this.isInactive()) {
			return;
		}
		if (
			typeof element.closest === 'function' &&
			(
				element.closest(INFLUX_MARKDOWN_MOUNT_SELECTOR)
				|| element.closest(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`)
			)
		) {
			return;
		}

		const filePath = context.sourcePath;
		if (!filePath) {
			return;
		}

		const settings = this.plugin.data.settings;
		if (settings.showInfluxInSidebar) {
			const previewRoot = this.getActivePostProcessorHost(context.docId, filePath)?.previewRoot
				?? resolvePreviewRoot(element);
			if (previewRoot) {
				cleanupPreviewContainers(previewRoot);
			}
			return;
		}

		const host = this.ensurePostProcessorPreviewHost(element, context);
		if (!host) {
			this.schedulePreviewRefreshForPath(filePath);
			return;
		}

		const { previewRoot, container } = host;

		const preferredContainerId = container.id || `influx-preview-host-${context.docId}`;
		const renderKey = `${context.docId}:${filePath}`;
		const existingRender = this.inflightPostProcessorRenders.get(renderKey);
		if (existingRender) {
			await existingRender;
			return;
		}

		const renderPromise = (async () => {
			await this.renderPreviewForContainer({
				previewDiv: previewRoot,
				existingContainer: container,
				filePath,
				fileMtime: this.apiAdapter.getFileByPath(filePath)?.stat?.mtime ?? 0,
				preferredContainerId,
			});
		})().catch((error) => {
			logger.error('Failed to render preview from post-processor host', { filePath, error });
			this.schedulePreviewRefreshForPath(filePath);
		}).finally(() => {
			if (this.inflightPostProcessorRenders.get(renderKey) === renderPromise) {
				this.inflightPostProcessorRenders.delete(renderKey);
			}
		});

		this.inflightPostProcessorRenders.set(renderKey, renderPromise);
		await renderPromise;
	}

	private async renderPreviewForContainer(params: {
		previewDiv: HTMLElement;
		existingContainer?: HTMLElement | null;
		filePath: string;
		fileMtime: number;
		preferredContainerId?: string;
		resolveLatestPreviewDiv?: () => HTMLElement | null;
	}): Promise<void> {
		const { previewDiv, existingContainer: providedContainer, filePath, fileMtime, preferredContainerId, resolveLatestPreviewDiv } = params;
		if (this.isInactive()) {
			return;
		}

		const settings = this.plugin.data.settings;

		let targetPreviewDiv = previewDiv;
		let existingContainer = providedContainer
			?? this.findKnownPreviewContainer(filePath, targetPreviewDiv, preferredContainerId);
		cleanupDuplicatePreviewWrappers(targetPreviewDiv, existingContainer);
		const renderOwner = existingContainer ?? targetPreviewDiv;
		const renderKey = this.getPreviewRenderKey(filePath, renderOwner);
		const renderSeq = (this.latestPreviewRenderSeq.get(renderKey) ?? 0) + 1;
		this.latestPreviewRenderSeq.set(renderKey, renderSeq);

		const dependencyRevision = cacheManager.getDependencyRevision();
		const fileHash = `${filePath}-${fileMtime}-${this.computeSettingsHash()}-${dependencyRevision}`;
		const shouldAbortRender = () => (
			this.isInactive()
			|| cacheManager.getDependencyRevision() !== dependencyRevision
			|| this.latestPreviewRenderSeq.get(renderKey) !== renderSeq
		);

		if (this.hasFreshPreviewRoot(fileHash, existingContainer)) {
			return;
		}

		const result = await createInfluxFileForRender({
			filePath,
			api: this.apiAdapter,
			mode: 'preview',
			settings,
			shouldAbort: shouldAbortRender,
		});
		if (!result || shouldAbortRender()) {
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
			existingContainer = this.findKnownPreviewContainer(filePath, targetPreviewDiv, preferredContainerId);
			cleanupDuplicatePreviewWrappers(targetPreviewDiv, existingContainer);
		}
		if (shouldAbortRender()) {
			return;
		}
		if (this.hasFreshPreviewRoot(fileHash, existingContainer)) {
			return;
		}
		const anchor = this.getOrCreatePreviewRoot(
			targetPreviewDiv,
			filePath,
			preferredContainerId ?? influxFile.uuid,
			existingContainer
		);

		anchor.root.render(
			<InfluxReactComponent influxFile={influxFile} preview={true} plugin={this.plugin} />
		);
		rootManager.updateMetadata(anchor.container, {
			previewRoot: targetPreviewDiv,
			previewHash: fileHash,
		});
	}

	private getPreviewRenderKey(filePath: string, owner: HTMLElement): string {
		return `${filePath}::${this.getPreviewRenderOwnerId(owner)}`;
	}

	private getPreviewRenderOwnerId(owner: HTMLElement): number {
		const existing = this.previewRenderOwnerIds.get(owner);
		if (existing) {
			return existing;
		}

		const next = this.nextPreviewRenderOwnerId;
		this.nextPreviewRenderOwnerId += 1;
		this.previewRenderOwnerIds.set(owner, next);
		return next;
	}

	private ensurePostProcessorPreviewHost(
		element: HTMLElement,
		context: MarkdownPostProcessorContext
	): { filePath: string; previewRoot: HTMLElement; container: HTMLElement } | null {
		const previewRoot = resolvePreviewRoot(element);
		if (!previewRoot) {
			return null;
		}

		const existingHost = this.getActivePostProcessorHost(context.docId, context.sourcePath);
		if (existingHost) {
			if (existingHost.previewRoot === previewRoot) {
				return existingHost;
			}

			this.releasePostProcessorHost(context.docId, existingHost.container);
		}

		const containerId = `influx-preview-host-${context.docId}`;
		const container = findExistingContainer(previewRoot, containerId)
			?? this.createPreviewContainer(previewRoot, containerId);
		const child = new MarkdownRenderChild(container);
		child.register(() => {
			this.releasePostProcessorHost(context.docId, container);
		});
		context.addChild(child);

		const host = {
			filePath: context.sourcePath,
			previewRoot,
			container,
		};
		this.postProcessorHosts.set(context.docId, host);
		return host;
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

		const trackedPreviewHosts = this.getTrackedPreviewHosts(filePath);
		const trackedPreviewRoots = new Set<HTMLElement>();
		let refreshedAny = false;

		if (trackedPreviewHosts.length > 0) {
			refreshedAny = true;
			const fileMtime = this.apiAdapter.getFileByPath(filePath)?.stat?.mtime ?? 0;
			await Promise.all(
				trackedPreviewHosts.map(({ container, previewRoot }) => {
					trackedPreviewRoots.add(previewRoot);

					return this.renderPreviewForContainer({
						previewDiv: previewRoot,
						existingContainer: container,
						filePath,
						fileMtime,
						preferredContainerId: container.id,
					}).catch((error) => {
						logger.error('Failed to refresh tracked preview host from post-processor', { filePath, error });
					});
				})
			);

			// When a file already has renderer-owned Reading-view hosts, targeted refresh
			// should stop there. Falling back into leaf-level rerender for the same file can
			// retrigger the markdown post-processor and create a refresh loop.
			return true;
		}

		const leaves = await this.getUntrackedPreviewLeaves(trackedPreviewRoots, filePath);
		if (leaves.length === 0) {
			return refreshedAny;
		}

		refreshedAny = true;

		await Promise.all(
			leaves.map((leaf) => {
				const influxLeaf = leaf as InfluxWorkspaceLeaf;
				return this.refreshUntrackedPreviewLeaf(influxLeaf, filePath).catch((error) => {
				logger.error('Failed to refresh preview leaf from post-processor', { filePath, error });
				});
			})
		);

		return refreshedAny;
	}

	private async getUntrackedPreviewLeaves(
		trackedPreviewRoots: Set<HTMLElement>,
		filePath?: string
	): Promise<WorkspaceLeaf[]> {
		const leaves: WorkspaceLeaf[] = [];
		const candidates: WorkspaceLeaf[] = [];
		const supportsDeferredViews = requireApiVersion('1.7.2');
		const shouldLoadDeferredLeaves = Boolean(filePath);

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			if (leaf.getViewState().type === 'markdown') {
				candidates.push(leaf);
			}
		});

		await Promise.all(candidates.map(async (leaf) => {
			if (this.isInactive()) {
				return;
			}

			if (supportsDeferredViews && leaf.isDeferred) {
				if (!shouldLoadDeferredLeaves) {
					return;
				}

				try {
					await leaf.loadIfDeferred();
				} catch (error) {
					logger.debug('Failed to load deferred markdown leaf before preview refresh', { error });
					return;
				}
			}

			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafFilePath = getLeafMarkdownFilePath(influxLeaf);
			if (!leafFilePath || (filePath && leafFilePath !== filePath) || !isLeafInPreviewMode(influxLeaf)) {
				return;
			}

			const previewRoot = getLeafPreviewModeRoot(influxLeaf);
			if (previewRoot && trackedPreviewRoots.has(previewRoot)) {
				return;
			}

			leaves.push(leaf);
		}));

		return leaves;
	}

	private async refreshUntrackedPreviewLeaf(
		leaf: InfluxWorkspaceLeaf,
		filePath: string
	): Promise<void> {
		if (this.isInactive()) {
			return;
		}

		if (!rerenderLeafPreviewMode(leaf)) {
			logger.debug('Failed to rerender untracked preview leaf', { filePath });
			return;
		}

		this.schedulePreviewRefreshForPath(filePath);
	}

	private getTrackedPreviewHosts(filePath?: string): Array<{
		container: HTMLElement;
		filePath: string;
		previewRoot: HTMLElement;
	}> {
		const hosts = new Map<HTMLElement, {
			container: HTMLElement;
			filePath: string;
			previewRoot: HTMLElement;
		}>();

		for (const [docId, host] of this.postProcessorHosts) {
			const activeHost = this.getActivePostProcessorHost(docId, host.filePath);
			if (!activeHost || (filePath && activeHost.filePath !== filePath)) {
				continue;
			}

			hosts.set(activeHost.container, activeHost);
		}

		const rootInfos = filePath
			? rootManager.getContainersByFilePath(filePath, 'preview').map((container) => rootManager.get(container)).filter((info): info is NonNullable<typeof info> => !!info)
			: rootManager.getRootsByType('preview');

		for (const info of rootInfos) {
			if (!info.filePath || hosts.has(info.container)) {
				continue;
			}

			const previewRoot = this.resolveTrackedPreviewRoot(info.container);
			if (!previewRoot || (filePath && info.filePath !== filePath)) {
				continue;
			}

			hosts.set(info.container, {
				container: info.container,
				filePath: info.filePath,
				previewRoot,
			});
		}

		return Array.from(hosts.values());
	}

	private hasFreshPreviewRoot(fileHash: string, existingContainer: HTMLElement | null): boolean {
		if (!existingContainer) {
			return false;
		}

		const info = rootManager.get(existingContainer);
		return Boolean(
			info &&
			typeof info.metadata?.previewHash === 'string' &&
			info.metadata.previewHash === fileHash
		);
	}

	private getOrCreatePreviewRoot(
		previewDiv: HTMLElement,
		filePath: string,
		containerId: string,
		existingContainer: HTMLElement | null
	): { root: Root; container: HTMLElement } {
		if (existingContainer) {
			const info = rootManager.get(existingContainer);
			if (info) {
				rootManager.updateMetadata(existingContainer, { previewRoot: previewDiv });
				return { root: info.root, container: existingContainer };
			}

			existingContainer.id = existingContainer.id || containerId;
			existingContainer.replaceChildren();
			const root = createRoot(existingContainer);
			rootManager.register(existingContainer, root, 'preview', filePath, { previewRoot: previewDiv });
			logger.debug('Attached root to existing preview container', { filePath });
			return { root, container: existingContainer };
		}

		cleanupPreviewContainers(previewDiv);
		const previewContainer = this.createPreviewContainer(previewDiv, containerId);
		const root = createRoot(previewContainer);
		rootManager.register(previewContainer, root, 'preview', filePath, { previewRoot: previewDiv });
		return { root, container: previewContainer };
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

	private getActivePostProcessorHost(
		docId: string,
		filePath: string
	): { filePath: string; previewRoot: HTMLElement; container: HTMLElement } | null {
		const host = this.postProcessorHosts.get(docId);
		if (!host) {
			return null;
		}

		if (
			host.filePath !== filePath ||
			!this.isElementConnected(host.container) ||
			!this.isElementConnected(host.previewRoot)
		) {
			this.releasePostProcessorHost(docId, host.container);
			return null;
		}

		return host;
	}

	private releasePostProcessorHost(docId: string, container: HTMLElement): void {
		const host = this.postProcessorHosts.get(docId);
		if (host?.container === container) {
			this.postProcessorHosts.delete(docId);
			this.inflightPostProcessorRenders.delete(`${docId}:${host.filePath}`);
		}

		rootManager.unmountDeferred(container);
		const wrapper = container.closest(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
		if (wrapper) {
			wrapper.remove();
			return;
		}

		container.remove();
	}

	private isElementConnected(element: HTMLElement): boolean {
		return (element as HTMLElement & { isConnected?: boolean }).isConnected !== false;
	}

	private resolveTrackedPreviewRoot(container: HTMLElement): HTMLElement | null {
		const metadataPreviewRoot = rootManager.get(container)?.metadata?.previewRoot;
		const previewRoot = metadataPreviewRoot as HTMLElement | undefined;
		if (previewRoot && typeof previewRoot.querySelectorAll === 'function' && this.isElementConnected(previewRoot)) {
			return previewRoot;
		}

		const resolvedPreviewRoot = resolvePreviewRoot(container);
		if (resolvedPreviewRoot) {
			rootManager.updateMetadata(container, { previewRoot: resolvedPreviewRoot });
		}

		return resolvedPreviewRoot;
	}

	private findTrackedPreviewContainer(filePath: string, previewRoot: HTMLElement): HTMLElement | null {
		const trackedContainer = rootManager
			.getContainersByFilePath(filePath, 'preview')
			.find((container) => this.resolveTrackedPreviewRoot(container) === previewRoot);
		if (trackedContainer) {
			return trackedContainer;
		}

		const existingContainer = findExistingContainer(previewRoot);
		if (!existingContainer || !rootManager.has(existingContainer)) {
			return null;
		}

		rootManager.updateMetadata(existingContainer, { previewRoot });
		return existingContainer;
	}

	private findKnownPreviewContainer(
		filePath: string,
		previewRoot: HTMLElement,
		preferredContainerId?: string
	): HTMLElement | null {
		return this.findTrackedPreviewContainer(filePath, previewRoot)
			?? findExistingContainer(previewRoot, preferredContainerId);
	}
}

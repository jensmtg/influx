import { WorkspaceLeaf, View, TFile, MarkdownPostProcessorContext } from 'obsidian';
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

type InfluxView = View & {
	file?: TFile;
	currentMode?: { type: string };
	mode?: string;
};

type InfluxWorkspaceLeaf = WorkspaceLeaf & {
	view?: InfluxView;
	containerEl: HTMLDivElement;
};

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

	constructor(
		private plugin: ObsidianInflux,
		private apiAdapter: ApiAdapter
	) {}

	async updateAllPreviews(): Promise<void> {
		if (this.plugin.data.settings.showInfluxInSidebar) {
			this.cleanupAllPreviewRootsAndContainers();
			return;
		}

		const previewLeaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafType: string = influxLeaf.view?.currentMode?.type;
			const viewMode = influxLeaf.view?.mode;
			const isPreviewMode = leafType === 'preview' || viewMode === 'preview';
			const hasPreviewRoot = isPreviewMode
				? true
				: !!influxLeaf.containerEl?.querySelector('.markdown-preview-view');

			if (hasPreviewRoot) {
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
		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl;
		const path = influxLeaf.view?.file?.path;
		if (!path) {
			logger.debug('No file path found for preview');
			return;
		}

		const settings = this.plugin.data.settings;
		const previewDiv = await this.resolvePreviewDiv(container, this.isLeafInPreviewMode(influxLeaf));
		if (!previewDiv) {
			logger.debug('Preview root not ready for leaf', { filePath: path });
			return;
		}
		if (settings.showInfluxInSidebar) {
			this.cleanupPreviewContainers(previewDiv);
			return;
		}

		const pipelineStart = performance.now();

		const existingContainer = this.findExistingContainer(previewDiv);
		this.cleanupDuplicatePreviewWrappers(previewDiv, existingContainer);

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
			this.cleanupPreviewContainers(previewDiv);
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
			this.cleanupPreviewContainers(previewDiv);

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
		const previewRoot = this.resolvePreviewRoot(element);
		if (!previewRoot) {
			return;
		}

		const filePath = context.sourcePath;
		if (!filePath) {
			return;
		}

		const settings = this.plugin.data.settings;
		if (settings.showInfluxInSidebar) {
			this.cleanupPreviewContainers(previewRoot);
			return;
		}

		logger.debug('[handlePreviewMode] Scheduling preview refresh', { filePath });
		this.schedulePreviewRefreshForPath(filePath);
	}

	private schedulePreviewRefreshForPath(filePath: string): void {
		const pending = this.postProcessRefreshTimers.get(filePath);
		if (pending) {
			clearTimeout(pending);
		}

		const timer = setTimeout(() => {
			this.postProcessRefreshTimers.delete(filePath);
			void this.refreshPreviewLeavesByPath(filePath);
		}, PreviewManager.POST_PROCESS_REFRESH_DELAY_MS);
		this.postProcessRefreshTimers.set(filePath, timer);
	}

	private async refreshPreviewLeavesByPath(filePath: string): Promise<void> {
		const leaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafPath = influxLeaf.view?.file?.path;
			if (leafPath !== filePath) {
				return;
			}

			const hasPreviewRoot = this.isLeafInPreviewMode(influxLeaf)
				|| !!influxLeaf.containerEl?.querySelector('.markdown-preview-view');
			if (!hasPreviewRoot) {
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

	private cleanupPreviewContainers(container: Element, logCounts = false): void {
		const wrappers = container.querySelectorAll(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
		const innerContainers = container.querySelectorAll(
			`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
		);

		if (logCounts) {
			logger.debug('[handlePreviewMode] Found existing wrappers:', { count: wrappers.length });
			logger.debug('[handlePreviewMode] Found orphaned containers:', { count: innerContainers.length });
		}

		innerContainers.forEach((node) => {
			const htmlNode = node as HTMLElement;
			rootManager.unmountDeferred(htmlNode);
			htmlNode.remove();
		});

		wrappers.forEach((wrapper) => wrapper.remove());
	}

	private cleanupAllPreviewRootsAndContainers(): void {
		rootManager.unmountByType('preview');
		document
			.querySelectorAll(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`)
			.forEach((wrapper) => wrapper.remove());
	}

	private isLeafInPreviewMode(leaf: InfluxWorkspaceLeaf): boolean {
		const leafType: string | undefined = leaf.view?.currentMode?.type;
		const viewMode = leaf.view?.mode;
		return leafType === 'preview' || viewMode === 'preview';
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

	private resolvePreviewRoot(element: HTMLElement): HTMLElement | null {
		if (element.classList.contains('markdown-preview-view')) {
			return element;
		}
		const closest = element.closest('.markdown-preview-view');
		if (closest instanceof HTMLElement) {
			return closest;
		}
		const nested = element.querySelector('.markdown-preview-view');
		return nested instanceof HTMLElement ? nested : null;
	}

	private cleanupDuplicatePreviewWrappers(previewDiv: Element, keepContainer: HTMLElement | null): void {
		const wrappers = previewDiv.querySelectorAll(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
		wrappers.forEach((wrapper) => {
			const container = wrapper.querySelector(
				`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
			) as HTMLElement | null;

			if (keepContainer && container === keepContainer) {
				return;
			}

			if (container) {
				rootManager.unmountDeferred(container);
			}
			wrapper.remove();
		});
	}

	private findExistingContainer(previewDiv: Element): HTMLElement | null {
		const containers = previewDiv.querySelectorAll(
			`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
		);

		let fallback: HTMLElement | null = null;
		let preferred: HTMLElement | null = null;
		containers.forEach((node) => {
			const container = node as HTMLElement;
			if (!fallback) {
				fallback = container;
			}
			if (!preferred && rootManager.has(container)) {
				preferred = container;
			}
		});

		if (preferred) {
			return preferred;
		}

		return fallback;
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

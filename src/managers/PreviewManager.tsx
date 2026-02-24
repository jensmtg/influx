import { WorkspaceLeaf, View, TFile, MarkdownPostProcessorContext } from 'obsidian';
import { ApiAdapter } from '../apiAdapter';
import { rootManager } from '../react/RootManager';
import { logger } from '../utils/logger';
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../components/ui/InfluxReactComponent';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import type ObsidianInflux from '../app/InfluxPlugin';
import { computeSettingsHash } from '../settings-hash-utils';
import { cacheManager } from '../state/CacheManager';
import { recordMetric } from '../utils/metrics';
import { CONSTANTS } from '../constants';

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

			const now = Date.now();
			const lastUpdate = this.plugin.updating.get(filePath);
			if (lastUpdate && now - lastUpdate < 1000) {
				return Promise.resolve();
			}
			this.plugin.updating.set(filePath, now);

			return this.updatePreview(leaf)
				.catch((error) => {
					logger.error('Failed to update preview', { filePath, error });
				})
				.finally(() => {
					this.plugin.updating.delete(filePath);
				});
		});

		await Promise.all(updatePromises);
	}

	async updatePreview(leaf: WorkspaceLeaf): Promise<void> {
		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl;
		const path = influxLeaf.view?.file?.path;
		if (!path) {
			logger.warn('No file path found for preview');
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
			rootManager.unmount(existingContainer);
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
				// Container exists but no tracked root - create new one
				anchor = createRoot(existingContainer);
				rootManager.register(existingContainer, anchor, 'preview', path);
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

		logger.debug('[handlePreviewMode] Processing file:', { filePath });

		// Also clean up any orphaned DOM elements (defense-in-depth)
		this.cleanupPreviewContainers(previewRoot, true);

		try {
			const pipelineStart = performance.now();
			// Use plugin's apiAdapter to preserve cache and ensure settings are available
			const influxFile = await InfluxFile.create(filePath, this.apiAdapter);
			if (!influxFile.show) {
				recordMetric({
					name: 'influx.pipeline.total',
					mode: 'preview',
					durationMs: performance.now() - pipelineStart,
					settings,
					always: true,
					ctx: {
						filePath,
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
					filePath,
					show: influxFile.show,
					listLimit: settings.listLimit || 0,
					totalEntryCount: influxFile.totalEntryCount,
					renderedCount: renderedComponents.length
				}
			});

			const influxWrapper = document.createElement('div');
			influxWrapper.className = CONSTANTS.INFLUX_WRAPPER_CLASS;

			const influxContainer = document.createElement(CONSTANTS.INFLUX_CONTAINER_TAG);
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);

			const currentSettings = this.plugin.data.settings;
			if (currentSettings.influxAtTopOfPage) {
				previewRoot.insertBefore(influxWrapper, previewRoot.firstChild);
			} else {
				previewRoot.appendChild(influxWrapper);
			}

			const anchor = createRoot(influxContainer);
			rootManager.register(influxContainer, anchor, 'preview', filePath);
			anchor.render(
				<InfluxReactComponent influxFile={influxFile} preview={true} plugin={this.plugin} />
			);
		} catch (error) {
			logger.error('Failed to render in preview mode', {
				filePath: context.sourcePath,
				error,
				stack: error instanceof Error ? error.stack : undefined,
			});
		}
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
			rootManager.unmount(htmlNode);
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

	private findExistingContainer(previewDiv: Element): HTMLElement | null {
		const wrapper = previewDiv.querySelector(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
		if (!wrapper) {
			return null;
		}
		return wrapper.querySelector(
			`${CONSTANTS.INFLUX_CONTAINER_TAG}, ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
		) as HTMLElement | null;
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

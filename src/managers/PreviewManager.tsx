import { WorkspaceLeaf, View, TFile, MarkdownPostProcessorContext } from 'obsidian';
import { ApiAdapter } from '../apiAdapter';
import { rootManager } from '../react/RootManager';
import { logger } from '../utils/logger';
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../components/ui/InfluxReactComponent';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import type ObsidianInflux from '../main';
import { computeSettingsHash } from '../settings-hash-utils';
import { cacheManager } from '../state/CacheManager';
import { recordMetric } from '../utils/metrics';

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
	constructor(
		private plugin: ObsidianInflux,
		private apiAdapter: ApiAdapter
	) {}

	async updateAllPreviews(): Promise<void> {
		const previewLeaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafType: string = influxLeaf.view?.currentMode?.type;
			const viewMode = influxLeaf.view?.mode;

			const hasPreviewClass = influxLeaf.containerEl?.classList.contains('markdown-preview-view');

			if (leafType === 'preview' || viewMode === 'preview' || hasPreviewClass) {
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

		const previewDiv = container.querySelector('.markdown-preview-view');

		if (!previewDiv) {
			logger.warn('No preview found for leaf');
			return;
		}

        const settings = this.plugin.data.settings;
        if (settings.showInfluxInSidebar) {
            return;
        }

		const apiAdapter = this.plugin.api;
		const path = influxLeaf.view?.file?.path;
		if (!path) {
			logger.warn('No file path found for preview');
			return;
		}
		const pipelineStart = performance.now();

        const existingContainer = previewDiv.querySelector(
            '.influx-preview-wrapper > influx-preview-container'
        ) as HTMLElement;

        const fileHash = `${path}-${this.computeSettingsHash()}`;

        if (existingContainer && cacheManager.getPreviewFileHash(path) === fileHash) {
            return;
        }

		// Clean up any existing root for this file path first
		rootManager.unmountByFilePath(path);

		const influxFile = await InfluxFile.create(path, apiAdapter);
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
        const renderedComponents = await influxFile.renderAllMarkdownBlocks();
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
			influxWrapper.className = 'influx-preview-wrapper';

			const influxContainer = document.createElement('influx-preview-container');
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
		if (!element.classList.contains('markdown-preview-view')) {
			return;
		}

		const filePath = context.sourcePath;
		if (!filePath) {
			return;
		}

		const settings = this.plugin.data.settings;
		if (settings.showInfluxInSidebar) {
			return;
		}

		logger.debug('[handlePreviewMode] Processing file:', { filePath });

		// Clean up any existing React root for this file path first
		// This is more reliable than DOM querying as it uses rootManager's tracking
		rootManager.unmountByFilePath(filePath);

		// Also clean up any orphaned DOM elements (defense-in-depth)
		this.cleanupPreviewContainers(element, true);

		try {
			const pipelineStart = performance.now();
			// Use plugin's apiAdapter to preserve cache and ensure settings are available
			const influxFile = await InfluxFile.create(filePath, this.plugin.api);
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
			const renderedComponents = await influxFile.renderAllMarkdownBlocks();
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
			influxWrapper.className = 'influx-preview-wrapper';

			const influxContainer = document.createElement('influx-preview-container');
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);

			const currentSettings = this.plugin.data.settings;
			if (currentSettings.influxAtTopOfPage) {
				element.insertBefore(influxWrapper, element.firstChild);
			} else {
				element.appendChild(influxWrapper);
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
		const wrappers = container.querySelectorAll('.influx-preview-wrapper');
		const innerContainers = container.querySelectorAll('influx-preview-container');

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

import { WorkspaceLeaf, View, TFile, MarkdownPostProcessorContext } from 'obsidian';
import { ApiAdapter } from '../apiAdapter';
import { ObsidianInfluxSettings } from '../types';
import { rootManager } from '../react/RootManager';
import { logger } from '../utils/logger';
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import { createRoot, Root } from 'react-dom/client';
import * as React from 'react';
import type ObsidianInflux from '../main';
import { computeSettingsHash } from '../settings-hash-utils';

type InfluxView = View & {
	file?: TFile;
	currentMode?: { type: string };
	mode?: string;
};

type InfluxWorkspaceLeaf = WorkspaceLeaf & {
	view?: InfluxView;
	containerEl: HTMLDivElement;
};

export class PreviewManager {
	constructor(
		private plugin: ObsidianInflux,
		private apiAdapter: ApiAdapter,
		private previewFileHashes: Map<string, string>
	) {}

	async updateAllPreviews(): Promise<void> {
		const previewLeaves: WorkspaceLeaf[] = [];

		this.plugin.app.workspace.iterateRootLeaves((leaf: WorkspaceLeaf) => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafType: string = influxLeaf.view?.currentMode?.type;
			const viewMode: string = influxLeaf.view?.mode;

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

		const apiAdapter = this.plugin.api;
		const path = influxLeaf.view?.file?.path;
		if (!path) {
			logger.warn('No file path found for preview');
			return;
		}

		const existingContainer = previewDiv.querySelector(
			'.influx-preview-wrapper > influx-preview-container'
		) as HTMLElement;

		const fileHash = `${path}-${this.computeSettingsHash()}`;

		if (existingContainer && this.plugin.previewFileHashes.get(path) === fileHash) {
			return;
		}

		const influxFile = await InfluxFile.create(path, apiAdapter);
		await influxFile.makeInfluxList();
		await influxFile.renderAllMarkdownBlocks();

		this.plugin.previewFileHashes.set(path, fileHash);

		let anchor: Root | undefined;

		if (existingContainer) {
			const info = rootManager.get(existingContainer);
			if (info) {
				anchor = info.root;
			} else {
				anchor = createRoot(existingContainer);
				rootManager.register(existingContainer, anchor, 'preview', path);
			}
		} else {
			const oldContainers = previewDiv.querySelectorAll('influx-preview-container');
			oldContainers.forEach((el) => {
				const oldContainer = el as HTMLElement;
				rootManager.unmount(oldContainer);
				const wrapper = oldContainer.closest('.influx-preview-wrapper');
				wrapper?.remove();
			});

			const orphanedWrappers = previewDiv.querySelectorAll('.influx-preview-wrapper');
			orphanedWrappers.forEach((wrapper) => {
				wrapper.remove();
			});

			const influxWrapper = document.createElement('div');
			influxWrapper.className = 'influx-preview-wrapper';

			const influxContainer = document.createElement('influx-preview-container');
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);

			const settings = this.plugin.data.settings;
			if (settings.influxAtTopOfPage) {
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

		logger.debug('[handlePreviewMode] Processing file:', { filePath });

		const existingInflux = element.querySelectorAll('.influx-preview-wrapper');
		logger.debug('[handlePreviewMode] Found existing wrappers:', { count: existingInflux.length });
		existingInflux.forEach((wrapper) => {
			const container = wrapper.querySelector('influx-preview-container') as HTMLElement;
			if (container) {
				rootManager.unmount(container);
			}
			wrapper.remove();
		});

		const orphanedContainers = element.querySelectorAll('influx-preview-container');
		logger.debug('[handlePreviewMode] Found orphaned containers:', { count: orphanedContainers.length });
		orphanedContainers.forEach((container) => {
			const containerElement = container as HTMLElement;
			rootManager.unmount(containerElement);
			containerElement.remove();
		});

		try {
			// Use plugin's apiAdapter to preserve cache and ensure settings are available
			const influxFile = await InfluxFile.create(filePath, this.plugin.api);
			await influxFile.makeInfluxList();
			await influxFile.renderAllMarkdownBlocks();

			if (!influxFile.show) {
				return;
			}

			const influxWrapper = document.createElement('div');
			influxWrapper.className = 'influx-preview-wrapper';

			const influxContainer = document.createElement('influx-preview-container');
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);

			const settings = this.plugin.data.settings;
			if (settings.influxAtTopOfPage) {
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

    private computeSettingsHash(): string {
        const settings = this.plugin.data.settings;
        logger.debug('Computing settings hash', {
            settings: {
                sortingPrinciple: settings.sortingPrinciple,
                sortingAttribute: settings.sortingAttribute,
                sourceBehaviour: settings.sourceBehaviour,
                includeFrontmatterLinks: settings.includeFrontmatterLinks,
                frontmatterProperties: settings.frontmatterProperties,
                fontSize: settings.fontSize,
                collapseAllByDefault: settings.collapseAllByDefault
            }
        });
        const hashString = computeSettingsHash(settings);
        logger.debug('Settings hash computed', { hash: hashString });
        return hashString;
    }
}

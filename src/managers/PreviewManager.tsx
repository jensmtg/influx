import { WorkspaceLeaf, View, TFile, Plugin } from 'obsidian';
import { ApiAdapter } from '../apiAdapter';
import { ObsidianInfluxSettings } from '../types';
import { rootManager } from '../react/RootManager';
import { logger } from '../utils/logger';
import InfluxFile from '../InfluxFile';
import InfluxReactComponent from '../InfluxReactComponent';
import { createRoot } from 'react-dom/client';
import { StyleSheetType } from '../createStyleSheet';
import * as React from 'react';

type InfluxView = View & {
	file?: TFile;
	currentMode?: { type: string };
	mode?: string;
};

type InfluxWorkspaceLeaf = WorkspaceLeaf & {
	view?: InfluxView;
	containerEl: HTMLDivElement;
};

type ObsidianInfluxPlugin = any;

export class PreviewManager {
	constructor(
		private plugin: ObsidianInfluxPlugin,
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

			if (this.plugin.updating.has(filePath)) {
				return Promise.resolve();
			}

			this.plugin.updating.add(filePath);

			return this.updatePreview(leaf, this.plugin.stylesheetForPreview)
				.finally(() => {
					this.plugin.updating.delete(filePath);
				});
		});

		await Promise.all(updatePromises);
	}

	async updatePreview(leaf: WorkspaceLeaf, stylesheetOverride?: StyleSheetType): Promise<void> {
		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl;

		const previewDiv = container.querySelector('.markdown-preview-view');

		if (!previewDiv) {
			throw new Error('No preview found');
		}

		const stylesheet = stylesheetOverride || this.plugin.stylesheetForPreview;

		const apiAdapter = this.plugin.api;
		const path = influxLeaf.view?.file?.path;
		if (!path) {
			throw new Error('No file path found');
		}

		const existingContainer = previewDiv.querySelector(
			'.influx-preview-wrapper > influx-preview-container'
		) as HTMLElement;

		const fileHash = `${path}-${this.computeSettingsHash()}`;

		if (existingContainer && this.plugin.previewFileHashes.get(path) === fileHash) {
			return;
		}

		const influxFile = await InfluxFile.create(path, apiAdapter, this.plugin);
		await influxFile.makeInfluxList();
		await influxFile.renderAllMarkdownBlocks();

		this.plugin.previewFileHashes.set(path, fileHash);

		let anchor: any;

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
			<InfluxReactComponent influxFile={influxFile} preview={true} sheet={stylesheet} />
		);
	}

	async handlePreviewMode(element: HTMLElement, context: any): Promise<void> {
		if (!element.classList.contains('markdown-preview-view')) {
			return;
		}

		const filePath = context.sourcePath;
		if (!filePath) {
			return;
		}

		logger.debug('[handlePreviewMode] Processing file:', { filePath });

		const stylesheet = this.plugin.stylesheetForPreview;

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
			const influxFile = await InfluxFile.create(filePath, this.plugin.api, this.plugin);
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
				<InfluxReactComponent influxFile={influxFile} preview={true} sheet={stylesheet} />
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
		const components = [
			settings.sortingPrinciple,
			settings.sortingAttribute,
			settings.listLimit,
			settings.showBehaviour,
			settings.variant,
			settings.entryHeaderVisible,
			settings.influxAtTopOfPage,
			settings.includeFrontmatterLinks,
			JSON.stringify([...settings.exclusionPattern].sort()),
			JSON.stringify([...settings.inclusionPattern].sort()),
			JSON.stringify([...settings.collapsedPattern].sort()),
			JSON.stringify([...settings.sourceInclusionPattern].sort()),
			JSON.stringify([...settings.sourceExclusionPattern].sort()),
		];

		let hash = 0;
		const str = components.join('|');
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return hash.toString(36);
	}
}

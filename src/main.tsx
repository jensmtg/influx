import { Plugin, TAbstractFile, TFile, WorkspaceLeaf, View } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt } from './cm6/asyncViewPlugin';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ApiAdapter } from './apiAdapter';
import { createStyleSheet, StyleSheetType } from './createStyleSheet';
import { EditorView } from '@codemirror/view';
import { ObsidianInfluxSettings, DEFAULT_SETTINGS, ComponentCallback, Data } from './types';
import { CONSTANTS } from './constants';
import { logger } from './utils/logger';
import { rootManager } from './react/RootManager';
import { updateCoordinator } from './utils/UpdateCoordinator';
import { influxUpdates$ } from './utils/Observable';

// Extend global Window interface for test function
declare global {
	interface Window {
		testInfluxReadingView?: () => void;
	}
}

// Type definitions for Obsidian internal properties
type InfluxView = View & {
	file?: TFile;
	currentMode?: { type: string };
	mode?: string;
};

type InfluxWorkspaceLeaf = WorkspaceLeaf & {
	view?: InfluxView;
	containerEl: HTMLDivElement;
};


// Debug helper to inspect JSS stylesheets in the DOM
function inspectStylesheets() {
	const styleElements = document.querySelectorAll('style[data-jss]');
	logger.debug('=== JSS Stylesheets in DOM ===');
	logger.debug(`Total count: ${styleElements.length}`, { count: styleElements.length });

	styleElements.forEach((el, index) => {
		const content = el.textContent;
		const influxRules = content?.match(/\.inlinked/g)?.length || 0;
		logger.debug(`[${index}] ${influxRules} influx rules, ${content?.length || 0} chars`, { index, influxRules, contentLength: content?.length || 0 });
		if (influxRules > 0) {
			logger.debug('  Sample:', { sample: content?.substring(0, 200) });
		}
	});

	// Count unique class names
	const allElements = document.querySelectorAll('[class*="inlinked"]');
	const classNames = new Set<string>();
	allElements.forEach(el => {
		el.classList.forEach(cls => {
			if (cls.includes('inlinked')) {
				classNames.add(cls);
			}
		});
	});
	logger.debug(`Unique influx class names in use: ${classNames.size}`, { count: classNames.size });
	Array.from(classNames).forEach(cls => logger.debug('  -', { className: cls }));
}


export default class ObsidianInflux extends Plugin {

	componentCallbacks: { [key: string]: ComponentCallback };
	updating: Set<string> = new Set();
	stylesheet: StyleSheetType;
	stylesheetForPreview: StyleSheetType;
	api: ApiAdapter;
	data: Data;
	// Track file hashes to avoid unnecessary re-renders
	private previewFileHashes: Map<string, string> = new Map();

	async onload(): Promise<void> {
		logger.info(`Loading plugin: Influx v${this.manifest.version}`);

		// Migrate old Influx elements from previous plugin versions
		this.migrateOldElements();

		this.componentCallbacks = {}
		this.api = new ApiAdapter(this.app)
		this.stylesheet = createStyleSheet(this.api)
		this.stylesheetForPreview = createStyleSheet(this.api, true)
		this.data = await this.loadDataInitially()

		this.registerEditorExtension(asyncDecoBuilderExt)

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		// Register Markdown Post Processor for preview/reading mode
		this.registerMarkdownPostProcessor(this.handlePreviewMode.bind(this));

		this.registerEvent(this.app.vault.on('modify', (file: TAbstractFile) => { this.triggerUpdates('modify', file) }));
		this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile) => {
			if (file instanceof TFile) {
				this.cleanupFileHash(file.path);
			}
			this.triggerUpdates('rename', file);
		}));
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => {
			if (file instanceof TFile) {
				this.cleanupFileHash(file.path);
			}
			this.triggerUpdates('delete', file);
		}));
		this.registerEvent(this.app.workspace.on('file-open', (file: TAbstractFile) => { this.triggerUpdates('file-open', file) }));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.cleanupReactRoots();
			this.triggerUpdates('layout-change');
		}));

		// Make plugin instance globally accessible for CodeMirror extensions
		(window as any).influxPlugin = this;

		// Expose debug functions to browser console
		if (CONSTANTS.DEBUG_MODE) {
			(window as any).influxDebug = {
				inspectStylesheets,
				getReactRoots: () => ({
					size: rootManager.size,
					entries: rootManager.getDebugInfo().map(({ container, inDom, info }) => ({
						id: container.id,
						inDom,
						visible: container.offsetParent !== null,
						type: info.type,
						filePath: info.filePath
					}))
				}),
				getStylesheets: () => ({
					main: this.stylesheet?.attached,
					preview: this.stylesheetForPreview?.attached
				})
			};
			logger.debug('Debug mode enabled. Use window.influxDebug to inspect.');
		}

		// Add manual trigger for testing reading view
		window.testInfluxReadingView = () => {
			this.updateInfluxInAllPreviews();
		};
	}

	async loadDataInitially() {
		const _data = await this.loadData()
		const data: Data = {
			settings: Object.assign({}, DEFAULT_SETTINGS, _data?.settings),
		}
		return data
	}

	/**
	 * Migrate old Influx elements from previous plugin versions
	 */
	private migrateOldElements(): void {
		const oldWidgets = document.querySelectorAll(CONSTANTS.INFLUX_ELEMENT_TAG_LEGACY);
		const oldContainers = document.querySelectorAll(CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY);

		if (oldWidgets.length > 0 || oldContainers.length > 0) {
			logger.info('Migrating old Influx elements', {
				widgets: oldWidgets.length,
				containers: oldContainers.length
			});

			oldWidgets.forEach(el => el.remove());
			oldContainers.forEach(el => el.remove());
		}
	}

	toggleSortOrder() {
		const newOrder = this.data.settings.sortingPrinciple === 'NEWEST_FIRST' ? 'OLDEST_FIRST' : 'NEWEST_FIRST'
		this.data.settings.sortingPrinciple = newOrder;
		this.saveSettingsByParams({ ...this.data.settings, "sortingPrinciple": newOrder })
	}

	async saveSettingsByParams(settings: ObsidianInfluxSettings) {
		await this.saveData({ ...this.data, settings: settings });
		this.triggerUpdates('save-settings')
	}

	/**
	 * Cleanup React roots for containers that are no longer in the DOM or are in hidden elements.
	 * This prevents memory leaks and overlapping elements when switching modes.
	 */
	private cleanupReactRoots(): void {
		// Clean up stale roots using rootManager
		rootManager.cleanupStale();

		// Also clean up any orphaned wrapper elements in the DOM
		// Use direct child selector for better performance
		const allContainers = document.querySelectorAll('.influx-preview-wrapper > influx-preview-container');
		allContainers.forEach(container => {
			const containerElement = container as HTMLElement;
			const info = rootManager.get(containerElement);

			// If there's a container but no tracked root, clean up its wrapper
			if (!info) {
				const wrapper = containerElement.closest('.influx-preview-wrapper');
				wrapper?.remove();
			}
		});
	}

	/**
	 * Cleanup React roots for a specific file path.
	 * Call this when files are deleted, renamed, or moved.
	 */
	private cleanupFileReactRoots(filePath: string): void {
		// Use rootManager to unmount by file path
		rootManager.unmountByFilePath(filePath);
	}

	/**
	 * Compute a hash of all settings for cache invalidation
	 */
	private computeSettingsHash(): string {
		const settings = this.data.settings;
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

		// Simple hash function
		let hash = 0;
		const str = components.join('|');
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return hash.toString(36);
	}

	/**
	 * Cleanup file hash for a specific file path.
	 * Call this when files are deleted, renamed, or moved.
	 */
	private cleanupFileHash(filePath: string): void {
		this.previewFileHashes.delete(filePath);
		this.cleanupFileReactRoots(filePath);
	}

	async onunload() {
		// Cancel all pending update operations
		updateCoordinator.unload();

		// Detach stylesheets to prevent DOM leaks
		if (this.stylesheet) {
			this.stylesheet.detach();
		}
		if (this.stylesheetForPreview) {
			this.stylesheetForPreview.detach();
		}
		// Clean up all React roots on plugin unload
		rootManager.unmountAll();
		this.previewFileHashes.clear();

		// Clean up window references to prevent memory leaks
		delete (window as any).influxPlugin;
		delete (window as any).influxDebug;
		delete (window as any).testInfluxReadingView;
	}

	registerInfluxComponent(id: string, callback: ComponentCallback) {
		if (!(id in this.componentCallbacks)) {
			this.componentCallbacks[id] = callback
		}
	}

	deregisterInfluxComponent(id: string) {
		if (id in this.componentCallbacks) {
			delete this.componentCallbacks[id]
		}
	}

	triggerUpdates(op: string, file?: TAbstractFile) {
		// Create a unique key for this update to prevent overlapping async operations
		const id = `${op}:${file?.path || 'global'}`;

		updateCoordinator.schedule(id, op, file?.path, async (signal) => {
			if (signal.aborted) return;

			// Only regenerate stylesheets when settings change, not on every update
			// This prevents JSS from creating duplicate class names like .inlinkedEntries-0-0-35
			const shouldRegenerateStylesheet = op === 'save-settings';
			if (shouldRegenerateStylesheet) {
				if (signal.aborted) return;

				// Detach old stylesheet before creating a new one to prevent duplicates
				if (this.stylesheet) {
					logger.debug('[triggerUpdates] Detaching old stylesheet');
					this.stylesheet.detach();
				}
				logger.debug('[triggerUpdates] Creating new stylesheet');
				this.stylesheet = createStyleSheet(this.api)
				logger.debug('[triggerUpdates] Stylesheet attached, classes:', { classes: Object.keys(this.stylesheet.classes) });
			}

			if (signal.aborted) return;

			// Notify components via observable
			await influxUpdates$.notify({
				op,
				stylesheet: this.stylesheet,
				file: file instanceof TFile ? file : undefined
			});

			if (!signal.aborted && op !== 'modify') {
				await this.updateInfluxInAllPreviews()
			}

			if (!signal.aborted && CONSTANTS.DEBUG_MODE) {
				inspectStylesheets();
			}
		}).catch(e => {
			// Error already logged by coordinator
		});
	}

	async updateInfluxInAllPreviews() {
		/**
		 * ! This is best-effort feature to maintain a live-updated
		 * ! influx footer in preview mode pages. It's buggy.
		 */
		const previewLeaves: WorkspaceLeaf[] = []

		this.app.workspace.iterateRootLeaves(leaf => {
			// Better preview mode detection - check multiple possible indicators
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafType: string = influxLeaf.view?.currentMode?.type
			const viewMode: string = influxLeaf.view?.mode

			// Use classList.contains() instead of querySelector() for better performance
			// classList.contains() is O(1) and doesn't trigger layout recalculation
			const hasPreviewClass = influxLeaf.containerEl?.classList.contains('markdown-preview-view')

			if (leafType === 'preview' || viewMode === 'preview' || hasPreviewClass) {
				previewLeaves.push(leaf)
			}
		})

		// Track per-file updates to prevent concurrent updates to the same file
		// while allowing multiple different files to update simultaneously
		const updatePromises = previewLeaves.map(leaf => {
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const filePath = influxLeaf.view?.file?.path
			if (!filePath) {
				return Promise.resolve()
			}

			// Skip if this file is already being updated
			if (this.updating.has(filePath)) {
				return Promise.resolve()
			}

			// Mark this file as being updated
			this.updating.add(filePath)

			return this.updateInfluxInPreview(leaf, this.stylesheetForPreview)
				.finally(() => {
					// Always remove the lock, even if update fails
					this.updating.delete(filePath)
				})
		})

		await Promise.all(updatePromises)
	}

	async updateInfluxInPreview(leaf: WorkspaceLeaf, stylesheetOverride?: StyleSheetType) {
		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl

		const previewDiv = container.querySelector(".markdown-preview-view");

		if (!previewDiv) {
			throw new Error('No preview found')
		}

		// Capture stylesheet at call time, not render time
		const stylesheet = stylesheetOverride || this.stylesheetForPreview;

		// Reuse existing api instance instead of creating new one (preserves cache)
		const apiAdapter = this.api
		const path = influxLeaf.view?.file?.path
		if (!path) {
			throw new Error('No file path found')
		}

		// Check if we already have an Influx container for this file
		// Use a single query with descendant selector to avoid multiple DOM traversals
		const existingContainer = previewDiv.querySelector('.influx-preview-wrapper > influx-preview-container') as HTMLElement

		// Calculate a comprehensive hash of all settings for cache invalidation
		const fileHash = `${path}-${this.computeSettingsHash()}`

		// If we have an existing container with the same data, skip the update
		if (existingContainer && this.previewFileHashes.get(path) === fileHash) {
			return
		}

		const influxFile = await InfluxFile.create(path, apiAdapter, this)
		await influxFile.makeInfluxList()
		await influxFile.renderAllMarkdownBlocks()

		// Update the hash
		this.previewFileHashes.set(path, fileHash)

		let anchor: Root;

		if (existingContainer) {
			// Reuse existing container and root
			const info = rootManager.get(existingContainer);
			if (info) {
				anchor = info.root;
			} else {
				// Shouldn't happen, but create a new root if needed
				anchor = createRoot(existingContainer);
				rootManager.register(existingContainer, anchor, 'preview', path);
			}
		} else {
			// Clean up any old containers and their parent wrappers
			const oldContainers = previewDiv.querySelectorAll("influx-preview-container")
			oldContainers.forEach(el => {
				const oldContainer = el as HTMLElement
				rootManager.unmount(oldContainer)
				// Remove the entire wrapper, not just the container
				const wrapper = oldContainer.closest('.influx-preview-wrapper');
				wrapper?.remove();
			})

			// Also clean up any orphaned wrappers (without containers)
			const orphanedWrappers = previewDiv.querySelectorAll('.influx-preview-wrapper');
			orphanedWrappers.forEach(wrapper => {
				wrapper.remove();
			});

			// Create new wrapper and container
			const influxWrapper = document.createElement("div");
			influxWrapper.className = "influx-preview-wrapper";

			const influxContainer = document.createElement("influx-preview-container");
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);

			// Position based on influxAtTopOfPage setting
			const settings = this.data.settings;
			if (settings.influxAtTopOfPage) {
				previewDiv.insertBefore(influxWrapper, previewDiv.firstChild);
			} else {
				previewDiv.appendChild(influxWrapper);
			}

			// Create and track the React root using rootManager
			anchor = createRoot(influxContainer);
			rootManager.register(influxContainer, anchor, 'preview', path);
		}

		// Render or update the React component
		anchor.render(<InfluxReactComponent
			influxFile={influxFile}
			preview={true}
			sheet={stylesheet}
		/>);
	}

	async handlePreviewMode(element: HTMLElement, context: any) {
		// Only process if this is a markdown preview element
		if (!element.classList.contains('markdown-preview-view')) {
			return;
		}

		// Get the file path from context
		const filePath = context.sourcePath;
		if (!filePath) {
			return;
		}

		logger.debug('[handlePreviewMode] Processing file:', { filePath });

		// Capture stylesheet at call time, not render time
		const stylesheet = this.stylesheetForPreview;

		// Clean up ALL existing Influx preview wrappers in this container
		// This prevents overlapping elements when switching modes
		const existingInflux = element.querySelectorAll('.influx-preview-wrapper');
		logger.debug('[handlePreviewMode] Found existing wrappers:', { count: existingInflux.length });
		existingInflux.forEach(wrapper => {
			const container = wrapper.querySelector('influx-preview-container') as HTMLElement;
			if (container) {
				rootManager.unmount(container);
			}
			wrapper.remove();
		});

		// Also clean up any orphaned influx-preview-container elements
		// (e.g., from incomplete cleanups during mode switches)
		const orphanedContainers = element.querySelectorAll('influx-preview-container');
		logger.debug('[handlePreviewMode] Found orphaned containers:', { count: orphanedContainers.length });
		orphanedContainers.forEach(container => {
			const containerElement = container as HTMLElement;
			rootManager.unmount(containerElement);
			containerElement.remove();
		});

		try {
			const apiAdapter = new ApiAdapter(this.app);
			const influxFile = await InfluxFile.create(filePath, apiAdapter, this);
			await influxFile.makeInfluxList();
			await influxFile.renderAllMarkdownBlocks();

			// Check if we should show Influx for this file
			if (!influxFile.show) {
				return;
			}

			// Create the Influx wrapper
			const influxWrapper = document.createElement("div");
			influxWrapper.className = "influx-preview-wrapper";

			const influxContainer = document.createElement("influx-preview-container");
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);

			// Position based on influxAtTopOfPage setting
			// When true (checkbox OFF), show at top; when false (checkbox ON), show at bottom
			const settings = this.data.settings;
			if (settings.influxAtTopOfPage) {
				// Insert at the beginning (top of content)
				element.insertBefore(influxWrapper, element.firstChild);
			} else {
				// Append to the end (bottom of content)
				element.appendChild(influxWrapper);
			}

			// Create and track of React root using rootManager
			const anchor = createRoot(influxContainer);
			rootManager.register(influxContainer, anchor, 'preview', filePath);
			anchor.render(<InfluxReactComponent
				influxFile={influxFile}
				preview={true}
				sheet={stylesheet}
			/>);
		} catch (error) {
			// Log error with context for debugging
			logger.error('Failed to render in preview mode', {
				filePath: context.sourcePath,
				error,
				stack: error instanceof Error ? error.stack : undefined
			});
		}
	}
}
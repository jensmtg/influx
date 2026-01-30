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

export interface ObsidianInfluxSettings {
	liveUpdate: boolean;
	sortingPrinciple: 'NEWEST_FIRST' | 'OLDEST_FIRST';
	sortingAttribute: 'ctime' | 'mtime' | 'FILENAME'; // created or modified.
	showBehaviour: 'OPT_OUT' | 'OPT_IN';
	exclusionPattern: string[];
	inclusionPattern: string[];
	collapsedPattern: string[];
	sourceBehaviour: 'OPT_OUT' | 'OPT_IN';
	sourceInclusionPattern: string[];
	sourceExclusionPattern: string[];
	listLimit: number;
	variant: 'CENTER_ALIGNED' | 'ROWS';
	fontSize: number;
	entryHeaderVisible: boolean;
	influxAtTopOfPage: boolean;
	includeFrontmatterLinks: boolean;
	frontmatterProperties: string[];
}

export const DEFAULT_SETTINGS: Partial<ObsidianInfluxSettings> = {
	liveUpdate: true,
	sortingPrinciple: 'NEWEST_FIRST',
	sortingAttribute: 'ctime',
	showBehaviour: 'OPT_OUT',
	exclusionPattern: [],
	inclusionPattern: [],
	collapsedPattern: [],
	sourceBehaviour: 'OPT_OUT',
	sourceInclusionPattern: [],
	sourceExclusionPattern: [],
	listLimit: 0,
	variant: 'CENTER_ALIGNED',
	fontSize: 13,
	entryHeaderVisible: true,
	influxAtTopOfPage: false,
	includeFrontmatterLinks: false,
	frontmatterProperties: [],
};

export type ComponentCallback = (op: string, stylesheet: StyleSheetType, file?: TFile) => void
export interface Data {
	settings: ObsidianInfluxSettings,
}


// Constants for magic numbers
const DEBOUNCE_DELAY_MS = 100;
const DELAYED_CALLBACK_TIMEOUT_MS = 2000;

// Debug mode - set to true to enable verbose logging
const DEBUG_MODE = false;

function debugLog(...args: any[]) {
	if (DEBUG_MODE) {
		console.log('[Influx Debug]', ...args);
	}
}

/**
 * Debug helper to inspect JSS stylesheets in the DOM
 */
function inspectStylesheets() {
	const styleElements = document.querySelectorAll('style[data-jss]');
	debugLog('=== JSS Stylesheets in DOM ===');
	debugLog(`Total count: ${styleElements.length}`);

	styleElements.forEach((el, index) => {
		const content = el.textContent;
		const influxRules = content?.match(/\.inlinked/g)?.length || 0;
		debugLog(`[${index}] ${influxRules} influx rules, ${content?.length || 0} chars`);
		if (influxRules > 0) {
			debugLog('  Sample:', content?.substring(0, 200));
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
	debugLog(`Unique influx class names in use: ${classNames.size}`);
	Array.from(classNames).forEach(cls => debugLog('  -', cls));
}

export default class ObsidianInflux extends Plugin {

	componentCallbacks: { [key: string]: ComponentCallback };
	updating: Set<string> = new Set();
	pendingUpdates: Set<string> = new Set();
	stylesheet: StyleSheetType;
	stylesheetForPreview: StyleSheetType;
	api: ApiAdapter;
	data: Data;
	delayedShowCallbacks: { editor: EditorView, callback: () => void, time: number }[] = [];
	private updateDebouncers: { [key: string]: NodeJS.Timeout } = {};
	// Track React roots for proper cleanup to prevent memory leaks
	// Changed from WeakMap to Map to enable explicit cleanup and iteration
	private previewReactRoots: Map<HTMLElement, Root> = new Map();
	// Map file paths to their container elements for cleanup on rename/delete
	private filePathToContainer: Map<string, HTMLElement> = new Map();
	// Track file hashes to avoid unnecessary re-renders
	private previewFileHashes: Map<string, string> = new Map();

	async onload(): Promise<void> {
		console.log(`Loading plugin: Influx v${this.manifest.version}`);

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

		// Use window.setInterval to avoid TypeScript type inference issues
		const timerId = window.setInterval(this.tick.bind(this), 1000);
		// Store interval ID for cleanup if needed
		this.register(() => window.clearInterval(timerId));

		// Make plugin instance globally accessible for CodeMirror extensions
		(window as any).influxPlugin = this;

		// Expose debug functions to browser console
		if (DEBUG_MODE) {
			(window as any).influxDebug = {
				inspectStylesheets,
				getReactRoots: () => ({
					size: this.previewReactRoots.size,
					entries: Array.from(this.previewReactRoots.keys()).map(el => ({
						id: el.id,
						inDom: document.body.contains(el),
						visible: el.offsetParent !== null
					}))
				}),
				getStylesheets: () => ({
					main: this.stylesheet?.attached,
					preview: this.stylesheetForPreview?.attached
				})
			};
			debugLog('Debug mode enabled. Use window.influxDebug to inspect.');
		}

		// Add manual trigger for testing reading view
		window.testInfluxReadingView = () => {
			this.updateInfluxInAllPreviews();
		};
	}

	public delayShowInflux(editor: EditorView, showCallback: () => void) {
		// More efficient: filter and add in single operation
		this.delayedShowCallbacks = this.delayedShowCallbacks.filter(cb => cb.editor !== editor);
		this.delayedShowCallbacks.push({
			editor: editor,
			time: Date.now(),
			callback: showCallback
		});
	}

	private tick() {
		const now = Date.now();
		const readyCallbacks: Array<() => void> = [];
		const remaining: Array<{ editor: EditorView; callback: () => void; time: number }> = [];

		// Single pass: separate ready callbacks from remaining ones
		for (const cb of this.delayedShowCallbacks) {
			if (now > cb.time + DELAYED_CALLBACK_TIMEOUT_MS) {
				readyCallbacks.push(cb.callback);
			} else {
				remaining.push(cb);
			}
		}

		this.delayedShowCallbacks = remaining;

		// Execute ready callbacks after updating state to avoid re-entry issues
		for (const callback of readyCallbacks) {
			callback();
		}
	}

	async loadDataInitially() {
		const _data = await this.loadData()
		const data: Data = {
			settings: Object.assign({}, DEFAULT_SETTINGS, _data?.settings),
		}
		return data
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
		const toDelete: HTMLElement[] = [];
		for (const [container, root] of this.previewReactRoots) {
			// Check if container is no longer in DOM or is in a hidden element
			const isInDom = document.body.contains(container);
			const isVisible = container.offsetParent !== null || isInDom;

			if (!isInDom || !isVisible) {
				root.unmount();
				toDelete.push(container);
			}
		}
		for (const container of toDelete) {
			this.previewReactRoots.delete(container);
		}

		// Also clean up any orphaned wrapper elements in the DOM
		// Use direct child selector for better performance
		const allContainers = document.querySelectorAll('.influx-preview-wrapper > influx-preview-container');
		allContainers.forEach(container => {
			const root = this.previewReactRoots.get(container as HTMLElement);

			// If there's a container but no tracked root, clean up its wrapper
			if (!root) {
				const wrapper = (container as HTMLElement).closest('.influx-preview-wrapper');
				wrapper?.remove();
			}
		});
	}

	/**
	 * Cleanup React roots for a specific file path.
	 * Call this when files are deleted, renamed, or moved.
	 */
	private cleanupFileReactRoots(filePath: string): void {
		const container = this.filePathToContainer.get(filePath);
		if (container) {
			const root = this.previewReactRoots.get(container);
			if (root) {
				root.unmount();
				this.previewReactRoots.delete(container);
			}
			this.filePathToContainer.delete(filePath);

			// Remove the wrapper from DOM
			const wrapper = container.closest('.influx-preview-wrapper');
			wrapper?.remove();
		}
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
		// Detach stylesheets to prevent DOM leaks
		if (this.stylesheet) {
			this.stylesheet.detach();
		}
		if (this.stylesheetForPreview) {
			this.stylesheetForPreview.detach();
		}
		// Clean up all React roots on plugin unload
		for (const [container, root] of this.previewReactRoots) {
			root.unmount();
		}
		this.previewReactRoots.clear();
		this.previewFileHashes.clear();
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
		const updateKey = `${op}:${file?.path || 'global'}`;

		// Skip if this exact update is already pending
		if (this.pendingUpdates.has(updateKey)) {
			return;
		}

		// Mark this update as pending
		this.pendingUpdates.add(updateKey);

		// Clear existing debouncer for this specific update (not just operation type)
		if (this.updateDebouncers[updateKey]) {
			clearTimeout(this.updateDebouncers[updateKey])
		}

		// Debounce rapid successive updates to prevent conflicts
		this.updateDebouncers[updateKey] = setTimeout(async () => {
			try {
				// Only regenerate stylesheets when settings change, not on every update
				// This prevents JSS from creating duplicate class names like .inlinkedEntries-0-0-35
				const shouldRegenerateStylesheet = op === 'save-settings';
				if (shouldRegenerateStylesheet) {
					// Detach old stylesheet before creating a new one to prevent duplicates
					if (this.stylesheet) {
						debugLog('[triggerUpdates] Detaching old stylesheet');
						this.stylesheet.detach();
					}
					debugLog('[triggerUpdates] Creating new stylesheet');
					this.stylesheet = createStyleSheet(this.api)
					debugLog('[triggerUpdates] Stylesheet attached, classes:', Object.keys(this.stylesheet.classes));
				}

				if (op === 'modify') {
					if (this.data.settings.liveUpdate && file instanceof TFile) {
						// Use for...of for better performance than forEach
						for (const callback of Object.values(this.componentCallbacks)) {
							callback(op, this.stylesheet, file)
						}
					}
				}
				else {
					for (const callback of Object.values(this.componentCallbacks)) {
						callback(op, this.stylesheet)
					}
					this.updateInfluxInAllPreviews()
				}
				if (DEBUG_MODE) {
					inspectStylesheets();
				}
			} finally {
				// Always clear pending state, even if update fails
				this.pendingUpdates.delete(updateKey);
				delete this.updateDebouncers[updateKey]
			}
		}, DEBOUNCE_DELAY_MS)
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

			return this.updateInfluxInPreview(leaf)
				.finally(() => {
					// Always remove the lock, even if update fails
					this.updating.delete(filePath)
				})
		})

		await Promise.all(updatePromises)
	}

	async updateInfluxInPreview(leaf: WorkspaceLeaf) {
		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl

		const previewDiv = container.querySelector(".markdown-preview-view");

		if (!previewDiv) {
			throw new Error('No preview found')
		}

		// Reuse existing api instance instead of creating new one (preserves cache)
		const apiAdapter = this.api
		const path = influxLeaf.view?.file?.path
		if (!path) {
			throw new Error('No file path found')
		}

		// Check if we already have an Influx container for this file
		// Use a single query with descendant selector to avoid multiple DOM traversals
		const existingContainer = previewDiv.querySelector('.influx-preview-wrapper > influx-preview-container') as HTMLElement

		// Calculate a simple hash of the influx data to detect changes
		const fileHash = `${path}-${this.data.settings.sortingPrinciple}-${this.data.settings.sortingAttribute}`

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
			anchor = this.previewReactRoots.get(existingContainer)!
		} else {
			// Clean up any old containers and their parent wrappers
			const oldContainers = previewDiv.querySelectorAll("influx-preview-container")
			oldContainers.forEach(el => {
				const oldContainer = el as HTMLElement
				const oldRoot = this.previewReactRoots.get(oldContainer)
				if (oldRoot) {
					oldRoot.unmount()
					this.previewReactRoots.delete(oldContainer)
				}
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

			// Create and track the React root
			anchor = createRoot(influxContainer);
			this.previewReactRoots.set(influxContainer, anchor);
			this.filePathToContainer.set(path, influxContainer);
		}

		// Render or update the React component
		anchor.render(<InfluxReactComponent
			influxFile={influxFile}
			preview={true}
			sheet={this.stylesheetForPreview}
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

		debugLog('[handlePreviewMode] Processing file:', filePath);

		// Clean up ALL existing Influx preview wrappers in this container
		// This prevents overlapping elements when switching modes
		const existingInflux = element.querySelectorAll('.influx-preview-wrapper');
		debugLog('[handlePreviewMode] Found existing wrappers:', existingInflux.length);
		existingInflux.forEach(wrapper => {
			const container = wrapper.querySelector('influx-preview-container') as HTMLElement;
			if (container) {
				const root = this.previewReactRoots.get(container);
				if (root) {
					root.unmount();
					this.previewReactRoots.delete(container);
				}
			}
			wrapper.remove();
		});

		// Also clean up any orphaned influx-preview-container elements
		// (e.g., from incomplete cleanups during mode switches)
		const orphanedContainers = element.querySelectorAll('influx-preview-container');
		debugLog('[handlePreviewMode] Found orphaned containers:', orphanedContainers.length);
		orphanedContainers.forEach(container => {
			const root = this.previewReactRoots.get(container as HTMLElement);
			if (root) {
				root.unmount();
				this.previewReactRoots.delete(container as HTMLElement);
			}
			(container as HTMLElement).remove();
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

			// Create and track the React root
			const anchor = createRoot(influxContainer);
			this.previewReactRoots.set(influxContainer, anchor);
			anchor.render(<InfluxReactComponent
				influxFile={influxFile}
				preview={true}
				sheet={this.stylesheetForPreview}
			/>);
		} catch (error) {
			// Error logged but doesn't block rendering
		}
	}

}
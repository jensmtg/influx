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
const DOM_STABILITY_DELAY_MS = 50;
const DELAYED_CALLBACK_TIMEOUT_MS = 2000;

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
	 * Cleanup React roots for containers that are no longer in the DOM.
	 * This prevents memory leaks when files are closed or views are destroyed.
	 */
	private cleanupReactRoots(): void {
		const toDelete: HTMLElement[] = [];
		for (const [container, root] of this.previewReactRoots) {
			if (!document.body.contains(container)) {
				root.unmount();
				toDelete.push(container);
			}
		}
		for (const container of toDelete) {
			this.previewReactRoots.delete(container);
		}
	}

	/**
	 * Cleanup file hash for a specific file path.
	 * Call this when files are deleted, renamed, or moved.
	 */
	private cleanupFileHash(filePath: string): void {
		this.previewFileHashes.delete(filePath);
	}

	async onunload() {
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

		// Clear existing debouncer for this operation type
		if (this.updateDebouncers[op]) {
			clearTimeout(this.updateDebouncers[op])
		}

		// Debounce rapid successive updates to prevent conflicts
		this.updateDebouncers[op] = setTimeout(async () => {
			try {
				if (op === 'modify') {
					if (this.data.settings.liveUpdate && file instanceof TFile) {
						this.stylesheet = createStyleSheet(this.api)
						// Use for...of for better performance than forEach
						for (const callback of Object.values(this.componentCallbacks)) {
							callback(op, this.stylesheet, file)
						}
					}
				}
				else {
					this.stylesheet = createStyleSheet(this.api)
					for (const callback of Object.values(this.componentCallbacks)) {
						callback(op, this.stylesheet)
					}
					this.updateInfluxInAllPreviews()
				}
			} finally {
				// Always clear pending state, even if update fails
				this.pendingUpdates.delete(updateKey);
				delete this.updateDebouncers[op]
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
			// Clean up any old containers
			const oldContainers = previewDiv.querySelectorAll("influx-preview-container")
			oldContainers.forEach(el => {
				const oldContainer = el as HTMLElement
				const oldRoot = this.previewReactRoots.get(oldContainer)
				if (oldRoot) {
					oldRoot.unmount()
					this.previewReactRoots.delete(oldContainer)
				}
				oldContainer.parentElement?.remove()
			})

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

		// Clean up any existing React roots before removing elements
		const existingInflux = element.querySelectorAll('.influx-preview-wrapper');
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
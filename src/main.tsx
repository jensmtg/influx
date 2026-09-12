import { Plugin, TAbstractFile, TFile, WorkspaceLeaf, View } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import {
	asyncDecoBuilderExt,
	refreshInfluxEditorDecorations,
} from './cm6/asyncViewPlugin';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ApiAdapter } from './apiAdapter';
import { createStyleSheet, StyleSheetType } from './createStyleSheet';
import { getBacklinkSourceSignature } from './backlink-utils';

// Extend global Window interface for test function
import { shouldRenderInfluxForMarkdownElement } from './render-utils';

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
	useBacklinkCache: boolean;
	showWithoutBacklinks: boolean;
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
	useBacklinkCache: false,
	showWithoutBacklinks: false,
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

export type ComponentCallback = (
	op: string,
	stylesheet: StyleSheetType,
	files?: readonly TFile[],
) => void | Promise<void>
export interface Data {
	settings: ObsidianInfluxSettings,
}


// Constants for magic numbers
const DEBOUNCE_DELAY_MS = 100;
const MAX_PREVIEW_SIGNATURES = 32;

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
	updating: Set<WorkspaceLeaf> = new Set();
	private pendingPreviewUpdates: Set<WorkspaceLeaf> = new Set();
	pendingUpdates: Set<string> = new Set();
	stylesheet: StyleSheetType;
	stylesheetForPreview: StyleSheetType;
	api: ApiAdapter;
	data: Data;
	private updateDebouncers: Map<string, number> = new Map();
	private pendingModifiedFiles: Map<string, TFile> = new Map();
	private isUnloading = false;
	// Track React roots for proper cleanup to prevent memory leaks
	// Changed from WeakMap to Map to enable explicit cleanup and iteration
	private previewReactRoots: Map<HTMLElement, Root> = new Map();
	// A file can be open in multiple reading panes at once.
	private filePathToContainers: Map<string, Set<HTMLElement>> = new Map();
	private containerToFilePath: Map<HTMLElement, string> = new Map();
	private previewGenerations: WeakMap<HTMLElement, number> = new WeakMap();
	// Track backlink-source changes even when a preview has no rendered wrapper.
	private previewBacklinkSignatures: Map<string, string> = new Map();

	async onload(): Promise<void> {
		console.log(`Loading plugin: Influx v${this.manifest.version}`);

		this.isUnloading = false;
		this.componentCallbacks = {}
		this.api = new ApiAdapter(this.app)
		this.data = await this.loadDataInitially();
		this.stylesheet = createStyleSheet(this.api)
		this.stylesheetForPreview = createStyleSheet(this.api, true);

		// Make the instance available before existing editor views instantiate the extension.
		(window as any).influxPlugin = this;
		this.register(() => {
			if ((window as any).influxPlugin === this) {
				delete (window as any).influxPlugin;
			}
		});

		this.registerEditorExtension(asyncDecoBuilderExt)

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		// Register Markdown Post Processor for preview/reading mode
		this.registerMarkdownPostProcessor(this.handlePreviewMode.bind(this));

		// Metadata events run after indexing; resolve ensures the backlink graph is current.
		this.registerEvent(this.app.metadataCache.on('changed', (file: TFile) => {
			this.api.invalidateBacklinksCache()
			this.triggerUpdates('modify', file)
		}));
		this.registerEvent(this.app.metadataCache.on('resolve', (file: TFile) => {
			this.api.invalidateBacklinksCache()
			this.triggerUpdates('modify', file)
		}));
		this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			if (file instanceof TFile) {
				this.cleanupFilePreview(oldPath);
			}
			this.triggerUpdates('rename', file);
		}));
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => {
			if (file instanceof TFile) {
				this.cleanupFilePreview(file.path);
			}
			this.triggerUpdates('delete', file);
		}));
		this.registerEvent(this.app.workspace.on('file-open', (file: TAbstractFile) => {
			// A file can open while Obsidian or an optional cache is still settling.
			// Give it a fresh read instead of reusing an earlier backlink result.
			this.api.invalidateBacklinksCache()
			this.triggerUpdates('file-open', file)
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.cleanupReactRoots();
			this.triggerUpdates('layout-change');
		}));

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
		this.data.settings = settings;
		await this.saveData({ ...this.data, settings: settings });
		this.api.invalidateSettingsCache();
		this.triggerUpdates('save-settings')
	}

	/**
	 * Cleanup React roots for containers that are no longer in the DOM or are in hidden elements.
	 * This prevents memory leaks and overlapping elements when switching modes.
	 */
	private cleanupReactRoots(): void {
		const toDelete: HTMLElement[] = [];
		for (const [container, root] of this.previewReactRoots) {
			// A popout preview belongs to its own document, not document.body.
			if (!container.isConnected || container.ownerDocument.defaultView?.closed) {
				root.unmount();
				toDelete.push(container);
			}
		}
		for (const container of toDelete) {
			this.invalidatePreviewUpdate(
				container.closest('.markdown-preview-view') as HTMLElement | null,
			)
			this.previewReactRoots.delete(container);
			this.forgetPreviewContainer(container);
			container.closest('.markdown-preview-view')?.classList.remove('influx-has-preview');
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

	private beginPreviewUpdate(preview: HTMLElement): number {
		const generation = (this.previewGenerations.get(preview) ?? 0) + 1
		this.previewGenerations.set(preview, generation)
		return generation
	}

	private invalidatePreviewUpdate(preview: HTMLElement | null): void {
		if (preview) {
			this.beginPreviewUpdate(preview)
		}
	}

	private isCurrentPreviewUpdate(
		preview: HTMLElement,
		generation: number,
		leaf?: WorkspaceLeaf,
		path?: string,
	): boolean {
		if (
			this.isUnloading
			|| !preview.isConnected
			|| this.previewGenerations.get(preview) !== generation
		) {
			return false
		}
		if (!leaf || !path) {
			return true
		}

		const influxLeaf = leaf as InfluxWorkspaceLeaf
		return influxLeaf.view?.file?.path === path
			&& influxLeaf.containerEl.querySelector('.markdown-preview-view') === preview
	}

	private setPreviewBacklinkSignature(
		filePath: string,
		backlinks: InfluxFile['backlinks'],
	): void {
		this.previewBacklinkSignatures.delete(filePath)
		this.previewBacklinkSignatures.set(
			filePath,
			getBacklinkSourceSignature(backlinks),
		)

		while (this.previewBacklinkSignatures.size > MAX_PREVIEW_SIGNATURES) {
			const stalePath = Array.from(this.previewBacklinkSignatures.keys())
				.find(path => !this.filePathToContainers.has(path))
				?? this.previewBacklinkSignatures.keys().next().value
			if (stalePath === undefined) {
				return
			}
			this.previewBacklinkSignatures.delete(stalePath)
		}
	}

	private forgetPreviewContainer(container: HTMLElement): void {
		const filePath = this.containerToFilePath.get(container)
		if (!filePath) {
			return
		}

		this.containerToFilePath.delete(container)
		const containers = this.filePathToContainers.get(filePath)
		if (!containers) {
			return
		}
		containers.delete(container)
		if (containers.size === 0) {
			this.filePathToContainers.delete(filePath)
			this.previewBacklinkSignatures.delete(filePath)
		}
	}

	private trackPreviewContainer(filePath: string, container: HTMLElement): void {
		const previousPath = this.containerToFilePath.get(container)
		if (previousPath && previousPath !== filePath) {
			this.forgetPreviewContainer(container)
		}

		let containers = this.filePathToContainers.get(filePath)
		if (!containers) {
			containers = new Set()
			this.filePathToContainers.set(filePath, containers)
		}
		containers.add(container)
		this.containerToFilePath.set(container, filePath)
	}

	/**
	 * Cleanup React roots for a specific file path.
	 * Call this when files are deleted, renamed, or moved.
	 */
	private cleanupFileReactRoots(filePath: string): void {
		const containers = Array.from(this.filePathToContainers.get(filePath) ?? [])
		this.filePathToContainers.delete(filePath)
		for (const container of containers) {
			this.containerToFilePath.delete(container)
			this.invalidatePreviewUpdate(
				container.closest('.markdown-preview-view') as HTMLElement | null,
			)
			const root = this.previewReactRoots.get(container);
			if (root) {
				root.unmount();
				this.previewReactRoots.delete(container);
			}

			// Remove the wrapper from DOM
			const previewView = container.closest('.markdown-preview-view');
			const wrapper = container.closest('.influx-preview-wrapper');
			wrapper?.remove();
			if (!previewView?.querySelector('.influx-preview-wrapper')) {
				previewView?.classList.remove('influx-has-preview');
			}
		}
	}

	/**
	 * Cleanup preview state for a specific file path.
	 * Call this when files are deleted, renamed, or moved.
	 */
	private cleanupFilePreview(filePath: string): void {
		this.previewBacklinkSignatures.delete(filePath);
		this.cleanupFileReactRoots(filePath);
	}

	async onunload() {
		this.isUnloading = true;
		for (const timeout of this.updateDebouncers.values()) {
			window.clearTimeout(timeout);
		}
		this.updateDebouncers.clear();
		this.pendingModifiedFiles.clear();
		this.pendingUpdates.clear();
		this.updating.clear();
		this.pendingPreviewUpdates.clear();

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
			const preview = container.closest('.markdown-preview-view')
			container.closest('.influx-preview-wrapper')?.remove()
			if (!preview?.querySelector('.influx-preview-wrapper')) {
				preview?.classList.remove('influx-has-preview')
			}
		}
		this.previewReactRoots.clear();
		this.filePathToContainers.clear();
		this.containerToFilePath.clear();
		this.previewBacklinkSignatures.clear();
		this.componentCallbacks = {};
		if (this.api) {
			this.api.dispose();
		}
		delete window.testInfluxReadingView;
		if (DEBUG_MODE) {
			delete (window as any).influxDebug;
		}
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
		if (this.isUnloading) {
			return
		}
		if (op === 'rename' || op === 'delete') {
			// Invalidate before the debounce so opening a note cannot reuse old paths.
			this.api.invalidateFileCache();
		}
		if (op === 'modify') {
			if (!this.data.settings.liveUpdate || !(file instanceof TFile)) {
				return;
			}
			this.pendingModifiedFiles.set(file.path, file);
		}

		// Create a unique key for this update to prevent overlapping async operations
		const updateKey = op === 'modify'
			? 'modify:global'
			: `${op}:${file?.path || 'global'}`;

		// Reset the timer so this is a real trailing-edge debounce.
		const existingTimeout = this.updateDebouncers.get(updateKey)
		if (existingTimeout !== undefined) {
			window.clearTimeout(existingTimeout)
		}
		this.pendingUpdates.add(updateKey);

		// Debounce rapid successive updates to prevent conflicts
		const timeoutId = window.setTimeout(async () => {
			const modifiedFiles = op === 'modify'
				? Array.from(this.pendingModifiedFiles.values())
				: []
			if (op === 'modify') {
				this.pendingModifiedFiles.clear()
			}

			try {
				if (this.isUnloading || (op === 'modify' && !this.data.settings.liveUpdate)) {
					return
				}
				if (op === 'save-settings') {
					this.api.invalidateSettingsCache();
				}

				// Only regenerate stylesheets when settings change, not on every update
				// This prevents JSS from creating duplicate class names like .inlinkedEntries-0-0-35
				const shouldRegenerateStylesheet = op === 'save-settings';
				if (shouldRegenerateStylesheet) {
					// Detach old stylesheet before creating a new one to prevent duplicates
					if (this.stylesheet) {
						debugLog('[triggerUpdates] Detaching old stylesheet');
						this.stylesheet.detach();
					}
					if (this.stylesheetForPreview) {
						this.stylesheetForPreview.detach();
					}
					debugLog('[triggerUpdates] Creating new stylesheet');
					this.stylesheet = createStyleSheet(this.api)
					this.stylesheetForPreview = createStyleSheet(this.api, true)
					debugLog('[triggerUpdates] Stylesheet attached, classes:', Object.keys(this.stylesheet.classes));
				}

				if (op === 'modify') {
					if (modifiedFiles.length > 0) {
						await refreshInfluxEditorDecorations(true)
						if (this.isUnloading) {
							return
						}
						await Promise.allSettled(
							Object.values(this.componentCallbacks).map(async callback =>
								callback(op, this.stylesheet, modifiedFiles),
							),
						)
						if (this.isUnloading) {
							return
						}
						await this.updateInfluxInAllPreviews(true)
					}
				}
				else {
					await refreshInfluxEditorDecorations()
					if (this.isUnloading) {
						return
					}
					await Promise.allSettled(
						Object.values(this.componentCallbacks).map(async callback =>
							callback(op, this.stylesheet),
						),
					)
					if (this.isUnloading) {
						return
					}
					await this.updateInfluxInAllPreviews()
				}
				if (DEBUG_MODE) {
					inspectStylesheets();
				}
			} catch (error) {
				console.error(`[Influx] Failed to process ${op} update:`, error);
			} finally {
				// Always clear pending state, even if update fails
				if (this.updateDebouncers.get(updateKey) === timeoutId) {
					this.pendingUpdates.delete(updateKey);
					this.updateDebouncers.delete(updateKey)
				}
			}
		}, DEBOUNCE_DELAY_MS)
		this.updateDebouncers.set(updateKey, timeoutId)
	}

	async updateInfluxInAllPreviews(backlinksOnly = false) {
		if (this.isUnloading) {
			return
		}
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
		const updatePromises = previewLeaves.map(async leaf => {
			if (this.isUnloading) {
				return
			}
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const filePath = influxLeaf.view?.file?.path
			if (!filePath) {
				return Promise.resolve()
			}

			if (backlinksOnly) {
				const targetFile = this.api.getFileByPath(filePath)
				if (!targetFile) {
					return Promise.resolve()
				}
				const currentSignature = getBacklinkSourceSignature(
					await this.api.getBacklinks(targetFile),
				)
				if (this.isUnloading) {
					return
				}
				if (this.previewBacklinkSignatures.get(filePath) === currentSignature) {
					return Promise.resolve()
				}
			}

			return this.queueInfluxPreviewUpdate(leaf)
		})

		await Promise.allSettled(updatePromises)
	}

	private async queueInfluxPreviewUpdate(leaf: WorkspaceLeaf): Promise<void> {
		if (this.isUnloading) {
			return
		}
		if (this.updating.has(leaf)) {
			this.pendingPreviewUpdates.add(leaf)
			return
		}

		this.updating.add(leaf)
		try {
			await this.updateInfluxInPreview(leaf)
		} finally {
			this.updating.delete(leaf)
			if (!this.isUnloading && this.pendingPreviewUpdates.delete(leaf)) {
				await this.queueInfluxPreviewUpdate(leaf)
			}
		}
	}

	async updateInfluxInPreview(leaf: WorkspaceLeaf) {
		if (this.isUnloading) {
			return
		}
		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl

		const previewDiv = container.querySelector(".markdown-preview-view") as HTMLElement | null;

		if (!previewDiv) {
			throw new Error('No preview found')
		}

		// Reuse existing api instance instead of creating new one (preserves cache)
		const apiAdapter = this.api
		const path = influxLeaf.view?.file?.path
		if (!path) {
			throw new Error('No file path found')
		}
		const generation = this.beginPreviewUpdate(previewDiv)

		const influxFile = await InfluxFile.create(path, apiAdapter, this)
		if (!this.isCurrentPreviewUpdate(previewDiv, generation, leaf, path)) {
			return
		}
		const hasVisibleEntries = await influxFile.prepare()
		if (!this.isCurrentPreviewUpdate(previewDiv, generation, leaf, path)) {
			return
		}

		// Re-query after async work because the leaf may have been rebuilt.
		const existingContainer = previewDiv.querySelector('.influx-preview-wrapper > influx-preview-container') as HTMLElement
		if (!hasVisibleEntries) {
			previewDiv.classList.remove('influx-has-preview')
			if (existingContainer) {
				const existingRoot = this.previewReactRoots.get(existingContainer)
				if (existingRoot) {
					existingRoot.unmount()
					this.previewReactRoots.delete(existingContainer)
				}
				this.forgetPreviewContainer(existingContainer)
				existingContainer.closest('.influx-preview-wrapper')?.remove()
			}
			this.setPreviewBacklinkSignature(path, influxFile.backlinks)
			return
		}
		previewDiv.classList.add('influx-has-preview')

		let anchor: Root;

		if (existingContainer) {
			// Reuse existing container and root
			anchor = this.previewReactRoots.get(existingContainer) || createRoot(existingContainer)
			this.previewReactRoots.set(existingContainer, anchor)
			this.trackPreviewContainer(path, existingContainer)
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
				this.forgetPreviewContainer(oldContainer)
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
			this.trackPreviewContainer(path, influxContainer);
		}
		if (!this.isCurrentPreviewUpdate(previewDiv, generation, leaf, path)) {
			return
		}

		// Render or update the React component
		anchor.render(<InfluxReactComponent
			key={influxFile.file?.path || 'influx'}
			influxFile={influxFile}
			preview={true}
			sheet={this.stylesheetForPreview}
		/>);
		this.setPreviewBacklinkSignature(path, influxFile.backlinks)
	}

	async handlePreviewMode(element: HTMLElement, context: any) {
		if (this.isUnloading) {
			return
		}
		if (!shouldRenderInfluxForMarkdownElement(element)) {
			return;
		}

		// Only process if this is a markdown preview element
		if (!element.classList.contains('markdown-preview-view')) {
			return;
		}

		// Get the file path from context
		const filePath = context.sourcePath;
		if (!filePath) {
			return;
		}
		const generation = this.beginPreviewUpdate(element)

		debugLog('[handlePreviewMode] Processing file:', filePath);
		element.classList.remove('influx-has-preview');

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
				this.forgetPreviewContainer(container);
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
			this.forgetPreviewContainer(container as HTMLElement);
			(container as HTMLElement).remove();
		});
		try {
			const influxFile = await InfluxFile.create(filePath, this.api, this);
			if (!this.isCurrentPreviewUpdate(element, generation)) {
				return
			}
			const hasVisibleEntries = await influxFile.prepare()
			if (!this.isCurrentPreviewUpdate(element, generation)) {
				return
			}
			if (!hasVisibleEntries) {
				this.setPreviewBacklinkSignature(filePath, influxFile.backlinks)
				return;
			}
			element.classList.add('influx-has-preview');

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
			if (!this.isCurrentPreviewUpdate(element, generation)) {
				return
			}

			// Create and track the React root
			const anchor = createRoot(influxContainer);
			this.previewReactRoots.set(influxContainer, anchor);
			this.trackPreviewContainer(filePath, influxContainer);
			anchor.render(<InfluxReactComponent
				key={influxFile.file?.path || 'influx'}
				influxFile={influxFile}
				preview={true}
				sheet={this.stylesheetForPreview}
			/>);
			this.setPreviewBacklinkSignature(filePath, influxFile.backlinks)
		} catch (error) {
			if (this.isCurrentPreviewUpdate(element, generation) && !element.querySelector('.influx-preview-wrapper')) {
				element.classList.remove('influx-has-preview');
			}
			debugLog('[handlePreviewMode] Failed to render:', error)
		}
	}

}

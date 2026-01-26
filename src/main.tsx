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
	stylesheet: StyleSheetType;
	stylesheetForPreview: StyleSheetType;
	api: ApiAdapter;
	data: Data;
	delayedShowCallbacks: { editor: EditorView, callback: () => void, time: number }[] = [];
	private updateDebouncers: { [key: string]: NodeJS.Timeout } = {};
	// Track React roots for proper cleanup to prevent memory leaks
	private previewReactRoots: WeakMap<HTMLElement, Root> = new WeakMap();
	// Track file hashes to avoid unnecessary re-renders
	private previewFileHashes: Map<string, string> = new Map();

	async onload(): Promise<void> {

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
		// this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile) => { this.triggerUpdates('rename', file) }));
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => { this.triggerUpdates('delete', file) }));
		this.registerEvent(this.app.workspace.on('file-open', (file: TAbstractFile) => { this.triggerUpdates('file-open', file) }));
		this.registerEvent(this.app.workspace.on('layout-change', () => { this.triggerUpdates('layout-change') }));

		setInterval(this.tick.bind(this), 1000)

		// Add manual trigger for testing reading view
		// @ts-ignore
		window.testInfluxReadingView = () => {
			console.log('🧪 Manual trigger: Testing reading view...');
			this.updateInfluxInAllPreviews();
		};

		console.log('🚀 Influx: Plugin loaded. Run window.testInfluxReadingView() to test reading view');
	}

	public delayShowInflux(editor: EditorView, showCallback: () => void) {
		this.delayedShowCallbacks = this.delayedShowCallbacks.filter(cb => cb.editor !== editor)
		this.delayedShowCallbacks.push({
			editor: editor,
			time: Date.now(),
			callback: showCallback
		})
	}

	private tick() {

		const now = Date.now()
		const remaining: { editor: EditorView, callback: () => void, time: number }[] = []

		this.delayedShowCallbacks.forEach((cb => {
			if (now > cb.time + DELAYED_CALLBACK_TIMEOUT_MS ) {
				cb.callback()
			}
			else {
				remaining.push(cb)
			}
		}))

		this.delayedShowCallbacks = remaining


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

	async onunload() {
		// Note: WeakMap doesn't provide iteration, so we rely on individual cleanup in updateInfluxInPreview
		// The React roots will be automatically cleaned up when DOM elements are garbage collected
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
		// Clear existing debouncer for this operation type
		if (this.updateDebouncers[op]) {
			clearTimeout(this.updateDebouncers[op])
		}

		// Debounce rapid successive updates to prevent conflicts
		this.updateDebouncers[op] = setTimeout(async () => {
			if (op === 'modify') {
				if (this.data.settings.liveUpdate && file instanceof TFile) {
					this.stylesheet = createStyleSheet(this.api)
					Object.values(this.componentCallbacks).forEach(callback => callback(op, this.stylesheet, file))
				}
			}
			else {
				this.stylesheet = createStyleSheet(this.api)
				Object.values(this.componentCallbacks).forEach(callback => callback(op, this.stylesheet))
				this.updateInfluxInAllPreviews()
			}
			delete this.updateDebouncers[op]
		}, DEBOUNCE_DELAY_MS)
	}

	async updateInfluxInAllPreviews() {
		/**
		 * ! This is best-effort feature to maintain a live-updated
		 * ! influx footer in preview mode pages. It's buggy.
		 */
		console.log('🔍 Influx: updateInfluxInAllPreviews called');
		const previewLeaves: WorkspaceLeaf[] = []

		this.app.workspace.iterateRootLeaves(leaf => {
			// Better preview mode detection - check multiple possible indicators
			const influxLeaf = leaf as InfluxWorkspaceLeaf;
			const leafType: string = influxLeaf.view?.currentMode?.type
			const viewMode: string = influxLeaf.view?.mode
			const hasPreviewClass = influxLeaf.containerEl?.querySelector('.markdown-preview-view')
			const hasPreviewMode = influxLeaf.view?.mode === 'preview'

			console.log(`🔍 Influx: Leaf - type: ${leafType}, mode: ${viewMode}, hasPreviewClass: ${!!hasPreviewClass}, hasPreviewMode: ${hasPreviewMode}`);

			if ((leafType === 'preview') || (viewMode === 'preview') || hasPreviewClass || hasPreviewMode) {
				previewLeaves.push(leaf)
				console.log('✅ Influx: Found preview leaf');
			}
		})

		console.log(`🔍 Influx: Found ${previewLeaves.length} preview leaves`);

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
		console.log(' Influx: updateInfluxInPreview called');

		const influxLeaf = leaf as InfluxWorkspaceLeaf;
		const container: HTMLDivElement = influxLeaf.containerEl
		console.log(' Influx: Container:', container);

		const previewDiv = container.querySelector(".markdown-preview-view");

		if (!previewDiv) {
			throw new Error('No preview found')
		}

		const apiAdapter = new ApiAdapter(this.app)
		const path = influxLeaf.view?.file?.path
		if (!path) {
			throw new Error('No file path found')
		}

		// Check if we already have an Influx container for this file
		const existingWrapper = previewDiv.querySelector('.influx-preview-wrapper') as HTMLElement
		const existingContainer = existingWrapper?.querySelector('influx-preview-container') as HTMLElement

		// Calculate a simple hash of the influx data to detect changes
		const fileHash = `${path}-${this.data.settings.sortingPrinciple}-${this.data.settings.sortingAttribute}`

		// If we have an existing container with the same data, skip the update
		if (existingContainer && this.previewFileHashes.get(path) === fileHash) {
			console.log(' Influx: Skipping update, content unchanged');
			return
		}

		const influxFile = new InfluxFile(path, apiAdapter, this)
		await influxFile.makeInfluxList()
		await influxFile.renderAllMarkdownBlocks()

		// Update the hash
		this.previewFileHashes.set(path, fileHash)

		let anchor: Root;

		if (existingContainer) {
			// Reuse existing container and root
			anchor = this.previewReactRoots.get(existingContainer)!
			console.log(' Influx: Reusing existing React root');
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
			const influxFile = new InfluxFile(filePath, apiAdapter, this);
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
			console.error('Influx: Error in preview mode post processor:', error);
		}
	}

}
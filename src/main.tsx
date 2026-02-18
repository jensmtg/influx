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
import { EventManager } from './managers/EventManager';
import { PreviewManager } from './managers/PreviewManager';
import jss from 'jss';
import preset from 'jss-preset-default';

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


// Debug helper to inspect JSS stylesheets in DOM
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
	updating: Map<string, number> = new Map();
	stylesheet: StyleSheetType;
	stylesheetForPreview: StyleSheetType;
	api: ApiAdapter;
	data: Data;
	// Track file hashes to avoid unnecessary re-renders
	previewFileHashes: Map<string, string> = new Map();

	private eventManager: EventManager;
	private previewManager: PreviewManager;

	async onload(): Promise<void> {
		logger.info(`Loading plugin: Influx v${this.manifest.version}`);

		jss.setup(preset());

		this.migrateOldElements();

		this.componentCallbacks = {};
		this.api = new ApiAdapter(this.app, this);
		this.data = await this.loadDataInitially();
		this.stylesheet = createStyleSheet(this.api);
		this.stylesheetForPreview = createStyleSheet(this.api, true);

		// CRITICAL: Set window plugin reference BEFORE registering editor extension
		// This prevents race condition where CodeMirror extension initializes
		// and tries to access window.influxPlugin before it's set
		(window as any).influxPlugin = this;

		this.registerEditorExtension(asyncDecoBuilderExt)

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		this.eventManager = new EventManager(this);
		this.eventManager.register();

		this.previewManager = new PreviewManager(this, this.api, this.previewFileHashes);

		// Register Markdown Post Processor for preview/reading mode
		this.registerMarkdownPostProcessor(this.previewManager.handlePreviewMode.bind(this.previewManager));

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
			this.previewManager.updateAllPreviews();
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
	 * Cleanup React roots for containers that are no longer in DOM or are in hidden elements.
	 * This prevents memory leaks and overlapping elements when switching modes.
	 */
	cleanupReactRoots(): void {
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
	 * Cleanup file hash for a specific file path.
	 * Call this when files are deleted, renamed, or moved.
	 */
	cleanupFileHash(filePath: string): void {
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
				await this.previewManager.updateAllPreviews();
			}

			if (!signal.aborted && CONSTANTS.DEBUG_MODE) {
				inspectStylesheets();
			}
		}).catch(e => {
			// Error already logged by coordinator
		});
	}
}

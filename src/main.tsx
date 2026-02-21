import { Plugin, TAbstractFile, TFile, WorkspaceLeaf, View } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt } from './cm6/asyncViewPlugin';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { ApiAdapter } from './apiAdapter';
import { EditorView } from '@codemirror/view';
import { ObsidianInfluxSettings, DEFAULT_SETTINGS, Data } from './types';
import { CONSTANTS } from './constants';
import { logger } from './utils/logger';
import { rootManager } from './react/RootManager';
import { updateCoordinator } from './utils/UpdateCoordinator';
import { influxUpdates$ } from './utils/Observable';
import { EventManager } from './managers/EventManager';
import { PreviewManager } from './managers/PreviewManager';
import { InfluxSidebarView } from './views/InfluxSidebarView';
import { cleanupWindowGlobals, isDebugMode } from './utils/typeGuard';

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


export default class ObsidianInflux extends Plugin {

	updating: Map<string, number> = new Map();
	api: ApiAdapter;
	data: Data;
	// Track file hashes to avoid unnecessary re-renders
	previewFileHashes: Map<string, string> = new Map();

	private eventManager: EventManager;
	private previewManager: PreviewManager;

	async onload(): Promise<void> {
		logger.info(`Loading plugin: Influx v${this.manifest.version}`);

		this.migrateOldElements();

		this.api = new ApiAdapter(this.app, this);
		this.data = await this.loadDataInitially();

		// CRITICAL: Set window plugin reference BEFORE registering editor extension
		// This prevents race condition where CodeMirror extension initializes
		// and tries to access window.influxPlugin before it's set
		if (!(window as any).influxPlugin) {
			(window as any).influxPlugin = this;
		} else {
			logger.warn('window.influxPlugin already set - skipping assignment');
		}

		this.registerEditorExtension(asyncDecoBuilderExt)

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		this.eventManager = new EventManager(this);
		this.eventManager.register();

		this.previewManager = new PreviewManager(this, this.api, this.previewFileHashes);

		// Register Markdown Post Processor for preview/reading mode
		this.registerMarkdownPostProcessor(this.previewManager.handlePreviewMode.bind(this.previewManager));

		// Register sidebar view
		this.registerView(CONSTANTS.VIEW_TYPE_SIDEBAR, (leaf) => new InfluxSidebarView(leaf, this));

		// Add ribbon icon to open sidebar
		this.addRibbonIcon('links-coming-in', 'Open Influx sidebar', () => {
			this.openSidebar();
		});

		// Add command to open sidebar
		this.addCommand({
			id: 'open-influx-sidebar',
			name: 'Open Influx sidebar',
			callback: () => this.openSidebar()
		});

		// Open sidebar if mode is enabled
		if (this.data.settings.showInfluxInSidebar) {
			this.openSidebar();
		}

		// Expose debug functions to browser console (only when debug mode is enabled)
		if (isDebugMode()) {
			(window as any).influxDebug = {
				getReactRoots: () => ({
					size: rootManager.size,
					entries: rootManager.getDebugInfo().map(({ container, inDom, info }) => ({
						id: container.id,
						inDom,
						visible: container.offsetParent !== null,
						type: info.type,
						filePath: info.filePath
					}))
				})
			};
			logger.debug('Debug mode enabled. Use window.influxDebug to inspect.');
		}

		// Add manual trigger for testing reading view (only in debug mode)
		if (isDebugMode()) {
			(window as any).testInfluxReadingView = () => {
				this.previewManager.updateAllPreviews();
			};
		}
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
		const oldOrder = this.data.settings.sortingPrinciple;
		const newOrder = oldOrder === 'NEWEST_FIRST' ? 'OLDEST_FIRST' : 'NEWEST_FIRST';
		logger.debug('Toggle sort order', { oldOrder, newOrder });
		this.data.settings.sortingPrinciple = newOrder;
		this.saveSettingsByParams({ ...this.data.settings, "sortingPrinciple": newOrder });
		this.triggerUpdates('save-settings');
	}

	toggleFrontmatterLinks() {
		const newValue = !this.data.settings.includeFrontmatterLinks;
		logger.debug('Toggle frontmatter links', { newValue });
		this.data.settings.includeFrontmatterLinks = newValue;
		this.saveSettingsByParams({ ...this.data.settings, "includeFrontmatterLinks": newValue });
		this.triggerUpdates('save-settings');
	}

	cycleListLimit() {
		const currentLimit = this.data.settings.listLimit;
		const limits = [0, 5, 10, 15, 25, 50];

		// Find current index, move to next, wrap around
		const currentIndex = limits.indexOf(currentLimit);
		const nextIndex = (currentIndex + 1) % limits.length;
		const newLimit = limits[nextIndex];

		logger.debug('Cycle list limit', { oldLimit: currentLimit, newLimit });
		this.data.settings.listLimit = newLimit;
		this.saveSettingsByParams({ ...this.data.settings, "listLimit": newLimit });
		this.triggerUpdates('save-settings');
	}

	openSidebar() {
		this.app.workspace.ensureSideLeaf(CONSTANTS.VIEW_TYPE_SIDEBAR, 'right', { active: true });
	}

	closeSidebar() {
		this.app.workspace.getLeavesOfType(CONSTANTS.VIEW_TYPE_SIDEBAR).forEach(leaf => {
			leaf.detach();
		});
	}

	async saveSettingsByParams(settings: ObsidianInfluxSettings) {
		logger.debug('Saving settings', { sortingPrinciple: settings.sortingPrinciple });
		await this.saveData({ ...this.data, settings: settings });
		this.api.invalidateSettingsCache();
		// Invalidate preview manager's settings hash cache
		this.previewManager.invalidateSettingsHash();
		// Don't call triggerUpdates here - let the calling code decide if an update is needed
		// This prevents duplicate update triggers when called from settings.tsx
		logger.debug('Settings saved and cache invalidated');
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

		// Mark plugin as unloading (for type guards)
		(this as any).isUnloading = true;

		// Clean up all React roots on plugin unload
		rootManager.unmountAll();
		this.previewFileHashes.clear();
		this.updating.clear();

		// Clean up window references to prevent memory leaks
		cleanupWindowGlobals();
	}

	triggerUpdates(op: string, file?: TAbstractFile) {
		// Create a unique key for this update to prevent overlapping async operations
		const id = `${op}:${file?.path || 'global'}`;

		updateCoordinator.schedule(id, op, file?.path, async (signal) => {
			if (signal.aborted) return;

			// Notify components via observable
			await influxUpdates$.notify({
				op,
				file: file instanceof TFile ? file : undefined
			});

			if (!signal.aborted && op !== 'modify') {
				await this.previewManager.updateAllPreviews();
			}
		}).catch(e => {
			// Error already logged by coordinator
		});
	}
}

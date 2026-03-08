import { Plugin, TAbstractFile, TFile } from 'obsidian';
import { ApiAdapter } from '../domain/backlinks/api-adapter';
import InfluxFile from '../domain/backlinks/influx-file';
import { InlinkingFile } from '../domain/backlinks/inlinking-file';
import { ObsidianInfluxSettings, DEFAULT_SETTINGS, Data } from '../types';
import { CONSTANTS } from '../config/constants';
import { logger } from '../platform/diagnostics/logger';
import { rootManager } from '../platform/react/root-manager';
import { updateCoordinator } from './events/update-coordinator';
import { influxUpdates$ } from './events/influx-updates';
import { EventManager } from './events/event-manager';
import { PreviewManager } from '../features/preview/preview-manager';
import { cleanupWindowGlobals } from '../platform/obsidian/plugin-window-guards';
import { cacheManager } from '../platform/cache/cache-manager';
import { refreshAllInfluxEditorViews } from '../features/editor/codemirror/async-view-plugin';
import {
	attachWindowDebugHelpers,
	attachWindowPluginReference,
	migrateOldElements,
	registerPluginUi,
} from './influx-plugin-bootstrap';


export default class ObsidianInflux extends Plugin {

	updating: Map<string, number> = new Map();
	api: ApiAdapter;
	data: Data;
	isUnloading = false;

	private eventManager: EventManager;
	private previewManager: PreviewManager;

	async onload(): Promise<void> {
		logger.info(`Loading plugin: Influx v${this.manifest.version}`);
		updateCoordinator.initialize();

		migrateOldElements();

		this.api = new ApiAdapter(this.app, this);
		this.data = await this.loadDataInitially();

		// CRITICAL: Set window plugin reference BEFORE registering editor extension.
		attachWindowPluginReference(this);

		this.eventManager = new EventManager(this);
		this.eventManager.register();

		this.previewManager = new PreviewManager(this, this.api);
		registerPluginUi(this, this.previewManager);
		attachWindowDebugHelpers(this, this.previewManager);
	}

	async loadDataInitially() {
		const _data = await this.loadData()
		const data: Data = {
			settings: Object.assign({}, DEFAULT_SETTINGS, _data?.settings),
		}
		return data
	}

	async toggleSortOrder(): Promise<void> {
		const oldOrder = this.data.settings.sortingPrinciple;
		const newOrder = oldOrder === 'NEWEST_FIRST' ? 'OLDEST_FIRST' : 'NEWEST_FIRST';
		logger.debug('Toggle sort order', { oldOrder, newOrder });
		await this.saveSettingsByParams({ ...this.data.settings, sortingPrinciple: newOrder }, { triggerUpdates: true });
	}

	async toggleFrontmatterLinks(): Promise<void> {
		const newValue = !this.data.settings.includeFrontmatterLinks;
		logger.debug('Toggle frontmatter links', { newValue });
		await this.saveSettingsByParams({ ...this.data.settings, includeFrontmatterLinks: newValue }, { triggerUpdates: true });
	}

	async cycleListLimit(): Promise<void> {
		const currentLimit = this.data.settings.listLimit;
		const limits = [0, 5, 10, 15, 25, 50];

		// Find current index, move to next, wrap around
		const currentIndex = limits.indexOf(currentLimit);
		const nextIndex = (currentIndex + 1) % limits.length;
		const newLimit = limits[nextIndex];

		logger.debug('Cycle list limit', { oldLimit: currentLimit, newLimit });
		await this.saveSettingsByParams({ ...this.data.settings, listLimit: newLimit }, { triggerUpdates: true });
	}

	openSidebar() {
		this.app.workspace.ensureSideLeaf(CONSTANTS.VIEW_TYPE_SIDEBAR, 'right', { active: true });
	}

	closeSidebar() {
		this.app.workspace.getLeavesOfType(CONSTANTS.VIEW_TYPE_SIDEBAR).forEach(leaf => {
			leaf.detach();
		});
	}

	async saveSettingsByParams(
		settings: ObsidianInfluxSettings,
		options?: {
			triggerUpdates?: boolean;
			onSuccess?: () => void;
			onFailure?: (error: unknown) => void;
		}
	): Promise<boolean> {
		logger.debug('Saving settings', { sortingPrinciple: settings.sortingPrinciple });
		try {
			await this.saveData({ ...this.data, settings });
			this.data = { ...this.data, settings };
			this.api.invalidateSettingsCache();
			options?.onSuccess?.();
			if (options?.triggerUpdates) {
				this.triggerUpdates('save-settings');
			}
			logger.debug('Settings saved and cache invalidated');
			return true;
		} catch (error) {
			logger.error('Failed to save settings', { error });
			options?.onFailure?.(error);
			return false;
		}
	}

	/**
	 * Cleanup React roots for containers that are no longer in DOM or are in hidden elements.
	 * This prevents memory leaks and overlapping elements when switching modes.
	 */
	cleanupReactRoots(): void {
		// Clean up stale roots using rootManager
		rootManager.cleanupStale();

		// Also clean up any orphaned wrapper elements in the DOM
		// Use direct child selector for better performance and support both container tags.
		const allContainers = document.querySelectorAll(
			`.${CONSTANTS.INFLUX_WRAPPER_CLASS} > ${CONSTANTS.INFLUX_CONTAINER_TAG}, .${CONSTANTS.INFLUX_WRAPPER_CLASS} > ${CONSTANTS.INFLUX_CONTAINER_TAG_LEGACY}`
		);
		allContainers.forEach(container => {
			const containerElement = container as HTMLElement;
			const info = rootManager.get(containerElement);

			// If there's a container but no tracked root, clean up its wrapper
			if (!info) {
				const wrapper = containerElement.closest(`.${CONSTANTS.INFLUX_WRAPPER_CLASS}`);
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
		cacheManager.invalidatePreviewFileHash(filePath);
		this.cleanupFileReactRoots(filePath);
	}

	async onunload() {
		// Mark plugin as unloading early so async work bails fast.
		this.isUnloading = true;

		// Cancel all pending update operations
		updateCoordinator.unload();

		this.previewManager?.dispose();

		// Clean up all React roots on plugin unload
		rootManager.unmountAll();
		this.updating.clear();

		// Clean up cache
		cacheManager.clearAll();
		InfluxFile.clearBuildCaches();
		InlinkingFile.clearSummaryCaches();

		// Clean up window references to prevent memory leaks
		cleanupWindowGlobals();
	}

	triggerUpdates(op: string, file?: TAbstractFile) {
		// Coalesce by target path (or global) to avoid duplicate concurrent pipelines across ops.
		const id = file?.path ? `path:${file.path}` : 'global';

		updateCoordinator.schedule(id, op, file?.path, async (signal) => {
			if (signal.aborted) return;

			// Notify components via observable
			await influxUpdates$.notify({
				op,
				file: file instanceof TFile ? file : undefined
			});

			if (!signal.aborted && (op === 'save-settings' || op === 'file-open' || op === 'mode-change')) {
				refreshAllInfluxEditorViews();
			}

			if (!signal.aborted && op !== 'modify') {
				await this.previewManager.updateAllPreviews();
			}
		}).catch(e => {
			// Error already logged by coordinator
		});
	}
}

import { Plugin, TAbstractFile, TFile, requireApiVersion } from 'obsidian';
import { ApiAdapter } from '../domain/backlinks/api-adapter';
import InfluxFile from '../domain/backlinks/influx-file';
import { InlinkingFile } from '../domain/backlinks/inlinking-file';
import { ObsidianInfluxSettings, DEFAULT_SETTINGS, Data } from '../types';
import { CONSTANTS } from '../config/constants';
import { logger } from '../platform/diagnostics/logger';
import { rootManager } from '../platform/react/root-manager';
import { updateCoordinator } from './events/update-coordinator';
import { influxUpdates$, type InfluxUpdateOp } from '../platform/events/influx-updates';
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
	private static readonly STARTUP_REFRESH_DELAYS_MS = [160, 520, 1400];

	updating = new Set<string>();
	api: ApiAdapter;
	data: Data;
	isUnloading = false;
	private startupRefreshTimers: ReturnType<typeof setTimeout>[] = [];

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
		this.scheduleStartupRefreshes();
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
		if (requireApiVersion('1.7.2')) {
			void this.app.workspace.ensureSideLeaf(CONSTANTS.VIEW_TYPE_SIDEBAR, 'right', { active: true });
			return;
		}

		const existingLeaf = this.app.workspace.getLeavesOfType(CONSTANTS.VIEW_TYPE_SIDEBAR)[0];
		const targetLeaf = existingLeaf ?? this.app.workspace.getRightLeaf(false);
		if (!targetLeaf) {
			return;
		}

		void targetLeaf.setViewState({
			type: CONSTANTS.VIEW_TYPE_SIDEBAR,
			active: true,
		});
	}

	closeSidebar() {
		this.app.workspace.detachLeavesOfType(CONSTANTS.VIEW_TYPE_SIDEBAR);
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
		for (const timer of this.startupRefreshTimers) {
			clearTimeout(timer);
		}
		this.startupRefreshTimers = [];

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

	triggerUpdates(op: InfluxUpdateOp, file?: TAbstractFile, oldPath?: string) {
		// Coalesce most updates by current target path, but keep renames distinct so
		// an immediate follow-up modify on the new path does not erase oldPath-aware refresh work.
		const id = op === 'rename' && file?.path
			? `rename:${oldPath ?? ''}->${file.path}`
			: file?.path
				? `path:${file.path}`
				: 'global';
		const shouldUseTargetedPreviewRefresh =
			file instanceof TFile && (op === 'file-open' || op === 'mode-change');

		updateCoordinator.schedule(id, op, file?.path, async (signal) => {
			if (signal.aborted) return;

			// Notify components via observable
			void influxUpdates$.notify({
				op,
				file: file instanceof TFile ? file : undefined,
				oldPath,
			});

			if (!signal.aborted && (op === 'save-settings' || op === 'file-open' || op === 'mode-change' || op === 'modify' || op === 'rename' || op === 'delete')) {
				refreshAllInfluxEditorViews();
			}

			if (!signal.aborted) {
				if (shouldUseTargetedPreviewRefresh) {
					await this.previewManager.updatePreviewsForFilePath(file.path);
				} else {
					await this.previewManager.updateAllPreviews();
				}
			}
		}).catch(e => {
			// Error already logged by coordinator
		});
	}

	private scheduleStartupRefreshes(): void {
		this.startupRefreshTimers = ObsidianInflux.STARTUP_REFRESH_DELAYS_MS.map((delay) =>
			setTimeout(() => {
				if (this.isUnloading) {
					return;
				}

				refreshAllInfluxEditorViews();
				void this.previewManager.updateAllPreviews();
			}, delay)
		);
	}
}

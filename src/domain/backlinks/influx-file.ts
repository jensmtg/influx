import { TFile, CachedMetadata } from 'obsidian';
import type { ApiAdapter } from './api-adapter';
import type { BacklinksObject, ExtendedInlinkingFile } from './types';
import { InlinkingFile, type InlinkingFileApi } from './inlinking-file';
import { computeBuildSettingsHash } from '../settings/settings-hash';
import { cacheManager } from '../../platform/cache/cache-manager';
import { buildInfluxList } from './influx-file-list-builder';
import { createInfluxRenderEntries, recordInfluxRenderEntriesMetric } from './influx-file-render-entries';
import { backlinksContainChangedPath, resolveInfluxVisibility } from './influx-file-visibility';
import {
	clearInfluxListBuildCaches,
	getInflightInfluxListBuild,
	getRecentInfluxListBuild,
	makeInfluxListBuildCacheKey,
	setInflightInfluxListBuild,
	storeRecentInfluxListBuild,
	type InfluxListBuildResult,
	clearInflightInfluxListBuild,
} from './influx-file-list-cache';

export interface InfluxFileApi extends InlinkingFileApi {
    getFileByPath: ApiAdapter['getFileByPath'];
    getBacklinks: ApiAdapter['getBacklinks'];
	getBacklinksFresh: ApiAdapter['getBacklinksFresh'];
    getShowStatus: ApiAdapter['getShowStatus'];
    getCollapsedStatus: ApiAdapter['getCollapsedStatus'];
    isIncludableSource: ApiAdapter['isIncludableSource'];
    getSettings: ApiAdapter['getSettings'];
}

export default class InfluxFile {
    uuid: string;
    api: InfluxFileApi;
    file: TFile | null;
    meta: CachedMetadata | null;
    backlinks: BacklinksObject | null;
    inlinkingFiles: InlinkingFile[];
    components: ExtendedInlinkingFile[];
    show: boolean;
    collapsed: boolean;
    totalEntryCount: number;
    private initialized: boolean = false;


    /**
     * Async factory method to create and initialize an InfluxFile.
     * This prevents blocking operations in the constructor.
     */
    static async create(path: string, apiAdapter: InfluxFileApi): Promise<InfluxFile> {
        const influxFile = new InfluxFile(path, apiAdapter);
        await influxFile.initialize();
        return influxFile;
    }

    private constructor(path: string, apiAdapter: InfluxFileApi) {
        this.uuid = crypto.randomUUID()
        this.api = apiAdapter
        this.file = this.api.getFileByPath(path)
        // Initialize with default values
        this.show = false
        this.collapsed = false
        this.meta = null
        this.backlinks = null
        this.inlinkingFiles = []
        this.components = []
        this.totalEntryCount = 0
    }

    /**
     * Initialize InfluxFile with metadata, backlinks, and show status.
     * This is called by factory method to avoid blocking in the constructor.
     */
	private async initialize(): Promise<void> {
		if (!this.file) {
			this.initialized = true;
			return;
		}
		this.meta = this.api.getMetadata(this.file)
		this.refreshVisibility()
		this.initialized = true;
	}

	refreshVisibility(): boolean {
		const visibility = resolveInfluxVisibility(this.file, this.api);
		this.show = visibility.show
		this.collapsed = visibility.collapsed
		return this.show
	}

    /**
     * Ensure InfluxFile is properly initialized before use.
     * This prevents race conditions when methods are called before async initialization completes.
     */
    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error('InfluxFile must be created using the async create() factory method');
        }
    }

	shouldUpdate(file: TFile) {
		return this.shouldUpdatePaths([file.path]);
	}

	shouldUpdatePaths(paths: readonly string[]) {
		this.ensureInitialized();
		const changedPaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))));
		if (!this.file || changedPaths.length === 0) {
			return false;
		}
		const affectedBeforeRefresh = changedPaths.some((path) => backlinksContainChangedPath(this.backlinks, path));
		this.backlinks = this.api.getBacklinksFresh(this.file)
		const affectedAfterRefresh = changedPaths.some((path) => backlinksContainChangedPath(this.backlinks, path));
		return affectedBeforeRefresh || affectedAfterRefresh;
	}

    async makeInfluxList(options?: { freshBacklinks?: boolean; skipRecentBuildCache?: boolean }) {
        this.ensureInitialized();
		if (!this.file) {
			this.backlinks = null;
			this.applyInfluxListBuild({ inlinkingFiles: [], totalEntryCount: 0 });
			return;
		}

		const freshBacklinks = options?.freshBacklinks === true;
		const skipRecentBuildCache = options?.skipRecentBuildCache === true;
		this.backlinks = freshBacklinks ? this.api.getBacklinksFresh(this.file) : this.api.getBacklinks(this.file);
		const settings = this.api.getSettings();
		const settingsHash = computeBuildSettingsHash(settings);
        const dependencyRevision = cacheManager.getDependencyRevision();
        const buildKey = makeInfluxListBuildCacheKey(
			this.file.path,
			this.file.stat?.mtime ?? 0,
			settingsHash,
			dependencyRevision
		);

		if (!skipRecentBuildCache) {
			const recent = getRecentInfluxListBuild(buildKey);
			if (recent) {
				this.applyInfluxListBuild(recent);
            	return;
			}

	        const inflight = getInflightInfluxListBuild(buildKey);
	        if (inflight) {
				this.applyInfluxListBuild(await inflight);
            	return;
			}
		}

		const buildPromise = buildInfluxList({
			contextFile: this,
			currentFile: this.file,
			backlinks: this.backlinks,
			api: this.api,
			settings,
			settingsHash,
		});
		setInflightInfluxListBuild(buildKey, buildPromise);
        try {
			const built = await buildPromise;
			this.applyInfluxListBuild(built);
			if (!skipRecentBuildCache) {
				storeRecentInfluxListBuild(buildKey, built);
			}
        } finally {
			clearInflightInfluxListBuild(buildKey, buildPromise);
        }
    }

	private applyInfluxListBuild(result: InfluxListBuildResult): void {
		this.inlinkingFiles = [...result.inlinkingFiles];
		this.totalEntryCount = result.totalEntryCount;
	}

	static clearBuildCaches(): void {
		clearInfluxListBuildCaches();
	}

    static clearBuildCachesForTests(): void {
        InfluxFile.clearBuildCaches();
    }

    toEntries(): ExtendedInlinkingFile[] {
        this.ensureInitialized();
        if (!this.show) {
            return [];
        }

		const startTime = performance.now();
		const targetFilePath = this.file?.path;
		const entries = createInfluxRenderEntries({
			inlinkingFiles: this.inlinkingFiles,
			targetFilePath,
		});

		recordInfluxRenderEntriesMetric({
			api: this.api,
			targetFilePath,
			inputCount: this.inlinkingFiles.length,
			renderedCount: entries.length,
			startedAt: startTime,
		});

		this.components = entries
		return entries
    }
}

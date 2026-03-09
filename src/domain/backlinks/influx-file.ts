import { TFile, CachedMetadata, normalizePath } from 'obsidian';
import type { ApiAdapter } from './api-adapter';
import type { BacklinksObject, ExtendedInlinkingFile } from './types';
import { InlinkingFile, type InlinkingFileApi } from './inlinking-file';
import { recordMetric } from '../../platform/diagnostics/metrics';
import { computeSettingsHash } from '../settings/settings-hash';
import { cacheManager } from '../../platform/cache/cache-manager';
import { buildInfluxList } from './influx-file-list-builder';
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
		if (!this.file) {
			this.show = false
			this.collapsed = false
			return this.show
		}

		this.show = this.api.getShowStatus(this.file)
		this.collapsed = this.api.getCollapsedStatus(this.file)
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
        this.ensureInitialized();
        if (!this.file) {
            return false;
        }
        this.backlinks = this.api.getBacklinks(this.file)
        if (!this.backlinks || !this.backlinks.data) {
            return false
        }

        const normalizedTarget = normalizePath(file.path);
        const paths = this.backlinks.data instanceof Map
            ? Array.from(this.backlinks.data.keys())
            : Object.keys(this.backlinks.data);

        return paths.some(path =>
            normalizePath(path) === normalizedTarget
        );
    }

    async makeInfluxList() {
        this.ensureInitialized();
		if (!this.file) {
			this.backlinks = null;
			this.applyInfluxListBuild({ inlinkingFiles: [], totalEntryCount: 0 });
			return;
		}

		this.backlinks = this.api.getBacklinks(this.file);
		const settings = this.api.getSettings();
		const settingsHash = computeSettingsHash(settings);
        const dependencyRevision = cacheManager.getDependencyRevision();
        const buildKey = makeInfluxListBuildCacheKey(
			this.file.path,
			this.file.stat?.mtime ?? 0,
			settingsHash,
			dependencyRevision
		);

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
			storeRecentInfluxListBuild(buildKey, built);
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

        const settings = this.api.getSettings();
        const startTime = performance.now();
        const targetFilePath = this.file?.path;
        const entries = this.inlinkingFiles.map((inlinkingFile): ExtendedInlinkingFile => ({
            inlinkingFile,
            titleText: (inlinkingFile.title ?? '').trim(),
            summaryMarkdown: inlinkingFile.summary ?? '',
            sourcePath: inlinkingFile.file?.path ?? targetFilePath ?? '/',
        }));

        recordMetric({
            name: 'influx.markdown.render',
            mode: 'shared',
            durationMs: performance.now() - startTime,
            settings,
            ctx: {
                filePath: targetFilePath,
                inputCount: this.inlinkingFiles.length,
                renderedCount: entries.length,
                markdownConcurrency: 0,
            }
        });

        this.components = entries
        return entries
    }
}

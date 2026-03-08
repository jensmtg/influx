import { TFile } from 'obsidian';
import { ObsidianInfluxSettings } from '../../types/settings';
import { logger } from '../diagnostics/logger';
import type { BacklinksObject } from '../../types/backlinks';
import { CacheStats, createEmptyCacheStats, resetCacheStats } from './cache-stats';
import {
	BacklinksCacheStore,
	FileCacheStore,
	PreviewHashCacheStore,
	SummaryCacheStore,
	type SummaryCacheValue,
} from './cache-stores';

export interface FileCacheEntry {
	file: TFile;
	timestamp: number;
}

export interface BacklinksCacheEntry {
	backlinks: BacklinksObject;
	timestamp: number;
}

export interface SettingsCacheEntry {
	settings: ObsidianInfluxSettings;
	timestamp: number;
}

export interface RegexCacheEntry {
	regex: RegExp | null;
	timestamp: number;
}

export { SummaryCacheValue };

export interface CacheDebugInfo {
	fileCache: {
		size: number;
		entries: Array<{ path: string; age: number }>;
	};
	backlinksCache: {
		size: number;
		entries: Array<{ path: string; age: number }>;
	};
	settingsCache: {
		cached: boolean;
		age: number;
	};
	regexCache: {
		size: number;
		invalid: string[];
	};
	backlinksDependencyIndex: {
		sources: number;
		targets: number;
	};
	previewFileHashes: {
		size: number;
	};
	summaryCache: {
		size: number;
		sources: number;
		targets: number;
	};
	stats: CacheStats;
	settingsHash?: string;
}

export class InfluxCacheManager {
	private static instance: InfluxCacheManager;

	private readonly stats: CacheStats = createEmptyCacheStats();
	private readonly fileCacheStore = new FileCacheStore(this.stats, InfluxCacheManager.FILE_CACHE_MAX_ENTRIES, 5 * 60 * 1000);
	private readonly backlinksCacheStore = new BacklinksCacheStore(this.stats, InfluxCacheManager.BACKLINKS_CACHE_MAX_ENTRIES, 2 * 60 * 1000);
	private readonly previewHashCacheStore = new PreviewHashCacheStore(this.stats, InfluxCacheManager.PREVIEW_HASH_CACHE_MAX_ENTRIES);
	private readonly summaryCacheStore = new SummaryCacheStore(this.stats, InfluxCacheManager.SUMMARY_CACHE_MAX_ENTRIES, InfluxCacheManager.SUMMARY_STALE_TIME_MS);

	private settingsCache: SettingsCacheEntry | null = null;
	private regexCache = new Map<string, RegexCacheEntry>();
	private cachedSettingsHash: string | null = null;
	private dependencyRevision = 0;

	private static readonly SUMMARY_STALE_TIME_MS = 10 * 60 * 1000;
	private static readonly SUMMARY_CACHE_MAX_ENTRIES = 3000;
	private static readonly FILE_CACHE_MAX_ENTRIES = 2000;
	private static readonly BACKLINKS_CACHE_MAX_ENTRIES = 1500;
	private static readonly PREVIEW_HASH_CACHE_MAX_ENTRIES = 3000;
	private static readonly INVALID_REGEX_SENTINEL: RegExp | null = null;

	private constructor() {}

	public static getInstance(): InfluxCacheManager {
		if (!InfluxCacheManager.instance) {
			InfluxCacheManager.instance = new InfluxCacheManager();
		}
		return InfluxCacheManager.instance;
	}

	getFile(path: string): TFile | null {
		return this.fileCacheStore.get(path);
	}

	setFile(path: string, file: TFile): void {
		this.fileCacheStore.set(path, file);
	}

	invalidateFile(path: string): void {
		this.dependencyRevision += 1;
		this.fileCacheStore.invalidate(path);
		this.backlinksCacheStore.invalidateTarget(path);
		this.previewHashCacheStore.invalidate(path);
		this.summaryCacheStore.invalidateSource(path);
		this.summaryCacheStore.invalidateTarget(path);

		const dependentTargets = this.backlinksCacheStore.invalidateSource(path);
		for (const targetPath of dependentTargets) {
			this.previewHashCacheStore.invalidate(targetPath);
			this.summaryCacheStore.invalidateTarget(targetPath);
		}

		logger.debug('File cache invalidated', { path });
	}

	clearFileCache(): void {
		this.fileCacheStore.clear();
	}

	getBacklinks(path: string): BacklinksObject | null {
		return this.backlinksCacheStore.get(path);
	}

	setBacklinks(path: string, backlinks: BacklinksObject): void {
		this.backlinksCacheStore.set(path, backlinks);
	}

	clearBacklinksCache(): void {
		this.backlinksCacheStore.clear();
	}

	getSettings(): ObsidianInfluxSettings | null {
		if (!this.settingsCache) {
			this.stats.settingsMisses += 1;
			return null;
		}
		this.stats.settingsHits += 1;
		return this.settingsCache.settings;
	}

	setSettings(settings: ObsidianInfluxSettings): void {
		this.settingsCache = {
			settings,
			timestamp: Date.now(),
		};
	}

	invalidateSettingsCache(): void {
		this.dependencyRevision += 1;
		this.settingsCache = null;
		this.cachedSettingsHash = null;
		this.clearRegexCache();
		this.clearBacklinksCache();
		this.clearSummaryCache();
		logger.info('Settings cache invalidated');
	}

	getRegex(pattern: string): RegExp | null | undefined {
		const entry = this.regexCache.get(pattern);
		if (!entry) {
			this.stats.regexMisses += 1;
			return undefined;
		}

		this.stats.regexHits += 1;
		return entry.regex === InfluxCacheManager.INVALID_REGEX_SENTINEL ? null : entry.regex;
	}

	setRegex(pattern: string, regex: RegExp): void {
		this.regexCache.set(pattern, {
			regex,
			timestamp: Date.now(),
		});
	}

	setInvalidRegex(pattern: string): void {
		this.regexCache.set(pattern, {
			regex: InfluxCacheManager.INVALID_REGEX_SENTINEL,
			timestamp: Date.now(),
		});
	}

	clearRegexCache(): void {
		this.regexCache.clear();
		logger.info('Regex cache cleared');
	}

	getPreviewFileHash(path: string): string | undefined {
		return this.previewHashCacheStore.get(path);
	}

	setPreviewFileHash(path: string, hash: string): void {
		this.previewHashCacheStore.set(path, hash);
	}

	invalidatePreviewFileHash(path: string): void {
		this.previewHashCacheStore.invalidate(path);
	}

	clearPreviewFileHashes(): void {
		this.previewHashCacheStore.clear();
	}

	getSettingsHash(): string | null {
		return this.cachedSettingsHash;
	}

	setSettingsHash(hash: string): void {
		this.cachedSettingsHash = hash;
	}

	getDependencyRevision(): number {
		return this.dependencyRevision;
	}

	getSummary(sourcePath: string, sourceMtime: number, targetPath: string, settingsHash: string): SummaryCacheValue | null {
		return this.summaryCacheStore.get(sourcePath, sourceMtime, targetPath, settingsHash);
	}

	setSummary(
		sourcePath: string,
		sourceMtime: number,
		targetPath: string,
		settingsHash: string,
		value: SummaryCacheValue
	): void {
		this.summaryCacheStore.set(sourcePath, sourceMtime, targetPath, settingsHash, value);
	}

	clearSummaryCache(): void {
		this.summaryCacheStore.clear();
	}

	clearAll(): void {
		this.fileCacheStore.clear();
		this.backlinksCacheStore.clear();
		this.settingsCache = null;
		this.regexCache.clear();
		this.previewHashCacheStore.clear();
		this.cachedSettingsHash = null;
		this.dependencyRevision = 0;
		this.summaryCacheStore.clear();
		resetCacheStats(this.stats);
		logger.info('All caches cleared');
	}

	getDebugInfo(): CacheDebugInfo {
		return {
			fileCache: this.fileCacheStore.getDebugInfo(),
			backlinksCache: this.backlinksCacheStore.getDebugInfo(),
			settingsCache: {
				cached: !!this.settingsCache,
				age: this.settingsCache ? Date.now() - this.settingsCache.timestamp : 0,
			},
			regexCache: {
				size: this.regexCache.size,
				invalid: Array.from(this.regexCache.entries())
					.filter(([_, entry]) => entry.regex === InfluxCacheManager.INVALID_REGEX_SENTINEL)
					.map(([pattern]) => pattern),
			},
			backlinksDependencyIndex: this.backlinksCacheStore.getDependencyDebugInfo(),
			previewFileHashes: this.previewHashCacheStore.getDebugInfo(),
			summaryCache: this.summaryCacheStore.getDebugInfo(),
			stats: { ...this.stats },
		};
	}
}

export const cacheManager = InfluxCacheManager.getInstance();

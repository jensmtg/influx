import { TFile, normalizePath } from 'obsidian';
import { ObsidianInfluxSettings } from '../../types/settings';
import { logger } from '../diagnostics/logger';
import type { BacklinksObject } from '../../types/backlinks';

/**
 * Centralized cache management for Influx plugin
 * Consolidates all caches into a single, coherent system
 */

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

export interface SummaryCacheValue {
	summary: string;
	title: string;
	titleLineNum: number | undefined;
	isLinkInTitle: boolean;
}

interface SummaryCacheEntry extends SummaryCacheValue {
	timestamp: number;
	sourcePath: string;
	targetPath: string;
}

export interface CacheStats {
	fileHits: number;
	fileMisses: number;
	backlinksHits: number;
	backlinksMisses: number;
	settingsHits: number;
	settingsMisses: number;
	regexHits: number;
	regexMisses: number;
	previewHashHits: number;
	previewHashMisses: number;
	summaryHits: number;
	summaryMisses: number;
}

/**
 * Debug information structure
 */
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

	// File lookups by path
	private fileCache = new Map<string, FileCacheEntry>();

	// Backlinks results by file path
	private backlinksCache = new Map<string, BacklinksCacheEntry>();
	// Source path (normalized) -> cached backlink target paths that depend on it
	private backlinksTargetsBySource = new Map<string, Set<string>>();
	// Cached backlink target path -> normalized source paths it currently depends on
	private backlinksSourcesByTarget = new Map<string, Set<string>>();

	// Settings cache
	private settingsCache: SettingsCacheEntry | null = null;

	// Regex pattern cache
	private regexCache = new Map<string, RegexCacheEntry>();

	// File hash cache for preview mode
	private previewFileHashes = new Map<string, string>();

	// Settings hash for preview mode
	private cachedSettingsHash: string | null = null;

	// Summary cache for expensive per-source summary generation
	private summaryCache = new Map<string, SummaryCacheEntry>();
	private summaryKeysBySource = new Map<string, Set<string>>();
	private summaryKeysByTarget = new Map<string, Set<string>>();
	private stats: CacheStats = {
		fileHits: 0,
		fileMisses: 0,
		backlinksHits: 0,
		backlinksMisses: 0,
		settingsHits: 0,
		settingsMisses: 0,
		regexHits: 0,
		regexMisses: 0,
		previewHashHits: 0,
		previewHashMisses: 0,
		summaryHits: 0,
		summaryMisses: 0,
	};

	private static readonly SUMMARY_STALE_TIME_MS = 10 * 60 * 1000;
	private static readonly SUMMARY_CACHE_MAX_ENTRIES = 3000;

	// Sentinel for invalid regex patterns
	private static readonly INVALID_REGEX_SENTINEL: RegExp | null = null;

	private constructor() {}

	public static getInstance(): InfluxCacheManager {
		if (!InfluxCacheManager.instance) {
			InfluxCacheManager.instance = new InfluxCacheManager();
		}
		return InfluxCacheManager.instance;
	}

	/**
	 * File cache methods
	 */
	getFile(path: string): TFile | null {
		const key = this.normalizePathKey(path);
		const entry = this.fileCache.get(key);
		if (!entry) {
			this.stats.fileMisses += 1;
			return null;
		}

		// Check if cache entry is stale (5 minutes)
		const STALE_TIME = 5 * 60 * 1000;
		if (Date.now() - entry.timestamp > STALE_TIME) {
			this.fileCache.delete(key);
			this.stats.fileMisses += 1;
			logger.debug('File cache expired', { path });
			return null;
		}

		this.stats.fileHits += 1;
		return entry.file;
	}

	setFile(path: string, file: TFile): void {
		const key = this.normalizePathKey(path);
		this.fileCache.set(key, {
			file,
			timestamp: Date.now()
		});
	}

	invalidateFile(path: string): void {
		const normalizedPath = this.normalizePathKey(path);
		const dependentTargets = Array.from(this.backlinksTargetsBySource.get(normalizedPath) ?? []);

		this.fileCache.delete(normalizedPath);
		this.backlinksCache.delete(normalizedPath);
		this.previewFileHashes.delete(normalizedPath);
		this.removeDependencyEntriesForTarget(normalizedPath);
		this.backlinksTargetsBySource.delete(normalizedPath);
		this.removeSummaryEntriesForSource(normalizedPath);
		this.removeSummaryEntriesForTarget(normalizedPath);

		for (const targetPath of dependentTargets) {
			if (targetPath === normalizedPath) {
				continue;
			}
			this.backlinksCache.delete(targetPath);
			this.previewFileHashes.delete(targetPath);
			this.removeDependencyEntriesForTarget(targetPath);
			this.removeSummaryEntriesForTarget(targetPath);
		}

		logger.debug('File cache invalidated', { path });
	}

	clearFileCache(): void {
		this.fileCache.clear();
		logger.info('File cache cleared');
	}

	/**
	 * Backlinks cache methods
	 */
	getBacklinks(path: string): BacklinksObject | null {
		const key = this.normalizePathKey(path);
		const entry = this.backlinksCache.get(key);
		if (!entry) {
			this.stats.backlinksMisses += 1;
			return null;
		}

		// Check if cache entry is stale (2 minutes)
		const STALE_TIME = 2 * 60 * 1000;
		if (Date.now() - entry.timestamp > STALE_TIME) {
			this.backlinksCache.delete(key);
			this.stats.backlinksMisses += 1;
			logger.debug('Backlinks cache expired', { path });
			return null;
		}

		this.stats.backlinksHits += 1;
		return entry.backlinks;
	}

	setBacklinks(path: string, backlinks: BacklinksObject): void {
		const normalizedTarget = this.normalizePathKey(path);
		this.removeDependencyEntriesForTarget(normalizedTarget);

		this.backlinksCache.set(normalizedTarget, {
			backlinks,
			timestamp: Date.now()
		});

		const sourcePaths = this.extractBacklinksSourcePaths(backlinks);
		const normalizedSources = new Set<string>();

		for (const sourcePath of sourcePaths) {
			const normalizedSource = this.normalizePathKey(sourcePath);
			if (normalizedSource === normalizedTarget) {
				continue;
			}
			normalizedSources.add(normalizedSource);
			(this.backlinksTargetsBySource.get(normalizedSource) ?? this.createAndSet(this.backlinksTargetsBySource, normalizedSource)).add(normalizedTarget);
		}

		if (normalizedSources.size > 0) {
			this.backlinksSourcesByTarget.set(normalizedTarget, normalizedSources);
		}
	}

	clearBacklinksCache(): void {
		this.backlinksCache.clear();
		this.backlinksTargetsBySource.clear();
		this.backlinksSourcesByTarget.clear();
		logger.info('Backlinks cache cleared');
	}

	/**
	 * Settings cache methods
	 */
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
			timestamp: Date.now()
		};
		logger.debug('Settings cached');
	}

	invalidateSettingsCache(): void {
		this.settingsCache = null;
		this.cachedSettingsHash = null;
		this.clearRegexCache();
		this.clearBacklinksCache();
		this.clearSummaryCache();
		logger.info('Settings cache invalidated');
	}

	/**
	 * Regex cache methods
	 */
	getRegex(pattern: string): RegExp | null | undefined {
		const entry = this.regexCache.get(pattern);
		if (!entry) {
			this.stats.regexMisses += 1;
			return undefined;
		}

		this.stats.regexHits += 1;
		if (entry.regex === InfluxCacheManager.INVALID_REGEX_SENTINEL) {
			return null;
		}

		return entry.regex;
	}

	setRegex(pattern: string, regex: RegExp): void {
		this.regexCache.set(pattern, {
			regex,
			timestamp: Date.now()
		});
	}

	setInvalidRegex(pattern: string): void {
		this.regexCache.set(pattern, {
			regex: InfluxCacheManager.INVALID_REGEX_SENTINEL,
			timestamp: Date.now()
		});
	}

	clearRegexCache(): void {
		this.regexCache.clear();
		logger.info('Regex cache cleared');
	}

	/**
	 * Preview file hash cache methods
	 */
	getPreviewFileHash(path: string): string | undefined {
		const hash = this.previewFileHashes.get(this.normalizePathKey(path));
		if (hash === undefined) {
			this.stats.previewHashMisses += 1;
		} else {
			this.stats.previewHashHits += 1;
		}
		return hash;
	}

	setPreviewFileHash(path: string, hash: string): void {
		this.previewFileHashes.set(this.normalizePathKey(path), hash);
	}

	invalidatePreviewFileHash(path: string): void {
		this.previewFileHashes.delete(this.normalizePathKey(path));
	}

	clearPreviewFileHashes(): void {
		this.previewFileHashes.clear();
		logger.info('Preview file hashes cleared');
	}

	/**
	 * Settings hash cache methods
	 */
	getSettingsHash(): string | null {
		return this.cachedSettingsHash;
	}

	setSettingsHash(hash: string): void {
		this.cachedSettingsHash = hash;
	}

	/**
	 * Summary cache methods
	 */
	getSummary(sourcePath: string, sourceMtime: number, targetPath: string, settingsHash: string): SummaryCacheValue | null {
		const cacheKey = this.makeSummaryCacheKey(sourcePath, sourceMtime, targetPath, settingsHash);
		const entry = this.summaryCache.get(cacheKey);
		if (!entry) {
			this.stats.summaryMisses += 1;
			return null;
		}

		if (Date.now() - entry.timestamp > InfluxCacheManager.SUMMARY_STALE_TIME_MS) {
			this.removeSummaryEntry(cacheKey, entry);
			this.stats.summaryMisses += 1;
			return null;
		}

		this.stats.summaryHits += 1;
		return {
			summary: entry.summary,
			title: entry.title,
			titleLineNum: entry.titleLineNum,
			isLinkInTitle: entry.isLinkInTitle,
		};
	}

	setSummary(
		sourcePath: string,
		sourceMtime: number,
		targetPath: string,
		settingsHash: string,
		value: SummaryCacheValue
	): void {
		const normalizedSource = this.normalizePathKey(sourcePath);
		const normalizedTarget = this.normalizePathKey(targetPath);
		const cacheKey = this.makeSummaryCacheKey(sourcePath, sourceMtime, targetPath, settingsHash);
		const existing = this.summaryCache.get(cacheKey);
		if (existing) {
			this.removeSummaryEntry(cacheKey, existing);
		}

		this.summaryCache.set(cacheKey, {
			...value,
			timestamp: Date.now(),
			sourcePath: normalizedSource,
			targetPath: normalizedTarget,
		});

		(this.summaryKeysBySource.get(normalizedSource) ?? this.createAndSet(this.summaryKeysBySource, normalizedSource)).add(cacheKey);
		(this.summaryKeysByTarget.get(normalizedTarget) ?? this.createAndSet(this.summaryKeysByTarget, normalizedTarget)).add(cacheKey);
		this.enforceSummaryCacheLimit();
	}

	clearSummaryCache(): void {
		this.summaryCache.clear();
		this.summaryKeysBySource.clear();
		this.summaryKeysByTarget.clear();
		logger.info('Summary cache cleared');
	}

	/**
	 * Clear all caches
	 */
	clearAll(): void {
		this.fileCache.clear();
		this.backlinksCache.clear();
		this.backlinksTargetsBySource.clear();
		this.backlinksSourcesByTarget.clear();
		this.settingsCache = null;
		this.regexCache.clear();
		this.previewFileHashes.clear();
		this.cachedSettingsHash = null;
		this.summaryCache.clear();
		this.summaryKeysBySource.clear();
		this.summaryKeysByTarget.clear();
		this.resetStats();
		logger.info('All caches cleared');
	}

	/**
	 * Get debug information
	 */
	getDebugInfo(): CacheDebugInfo {
		return {
			fileCache: {
				size: this.fileCache.size,
				entries: Array.from(this.fileCache.entries()).map(([path, entry]) => ({
					path,
					age: Date.now() - entry.timestamp
				}))
			},
			backlinksCache: {
				size: this.backlinksCache.size,
				entries: Array.from(this.backlinksCache.entries()).map(([path, entry]) => ({
					path,
					age: Date.now() - entry.timestamp
				}))
			},
			settingsCache: {
				cached: !!this.settingsCache,
				age: this.settingsCache ? Date.now() - this.settingsCache.timestamp : 0
			},
			regexCache: {
				size: this.regexCache.size,
				invalid: Array.from(this.regexCache.entries())
					.filter(([_, entry]) => entry.regex === InfluxCacheManager.INVALID_REGEX_SENTINEL)
					.map(([pattern]) => pattern)
			},
			backlinksDependencyIndex: {
				sources: this.backlinksTargetsBySource.size,
				targets: this.backlinksSourcesByTarget.size
			},
			previewFileHashes: {
				size: this.previewFileHashes.size
			},
			summaryCache: {
				size: this.summaryCache.size,
				sources: this.summaryKeysBySource.size,
				targets: this.summaryKeysByTarget.size,
			},
			stats: { ...this.stats },
		};
	}

	private normalizePathKey(path: string): string {
		return normalizePath(path).toLowerCase();
	}

	private extractBacklinksSourcePaths(backlinks: BacklinksObject): string[] {
		if (!backlinks?.data) {
			return [];
		}
		return backlinks.data instanceof Map
			? Array.from(backlinks.data.keys())
			: Object.keys(backlinks.data);
	}

	private removeDependencyEntriesForTarget(targetPath: string): void {
		const sources = this.backlinksSourcesByTarget.get(targetPath);
		if (!sources) {
			return;
		}

		for (const sourcePath of sources) {
			const targets = this.backlinksTargetsBySource.get(sourcePath);
			if (!targets) {
				continue;
			}
			targets.delete(targetPath);
			if (targets.size === 0) {
				this.backlinksTargetsBySource.delete(sourcePath);
			}
		}

		this.backlinksSourcesByTarget.delete(targetPath);
	}

	private makeSummaryCacheKey(sourcePath: string, sourceMtime: number, targetPath: string, settingsHash: string): string {
		const normalizedSource = this.normalizePathKey(sourcePath);
		const normalizedTarget = this.normalizePathKey(targetPath);
		return `${normalizedSource}|${sourceMtime}|${normalizedTarget}|${settingsHash}`;
	}

	private removeSummaryEntriesForSource(sourcePath: string): void {
		const keys = this.summaryKeysBySource.get(sourcePath);
		if (!keys) {
			return;
		}
		for (const key of Array.from(keys)) {
			const entry = this.summaryCache.get(key);
			if (!entry) {
				continue;
			}
			this.removeSummaryEntry(key, entry);
		}
	}

	private removeSummaryEntriesForTarget(targetPath: string): void {
		const keys = this.summaryKeysByTarget.get(targetPath);
		if (!keys) {
			return;
		}
		for (const key of Array.from(keys)) {
			const entry = this.summaryCache.get(key);
			if (!entry) {
				continue;
			}
			this.removeSummaryEntry(key, entry);
		}
	}

	private removeSummaryEntry(cacheKey: string, entry: SummaryCacheEntry): void {
		this.summaryCache.delete(cacheKey);

		const sourceKeys = this.summaryKeysBySource.get(entry.sourcePath);
		if (sourceKeys) {
			sourceKeys.delete(cacheKey);
			if (sourceKeys.size === 0) {
				this.summaryKeysBySource.delete(entry.sourcePath);
			}
		}

		const targetKeys = this.summaryKeysByTarget.get(entry.targetPath);
		if (targetKeys) {
			targetKeys.delete(cacheKey);
			if (targetKeys.size === 0) {
				this.summaryKeysByTarget.delete(entry.targetPath);
			}
		}
	}

	private enforceSummaryCacheLimit(): void {
		const overflow = this.summaryCache.size - InfluxCacheManager.SUMMARY_CACHE_MAX_ENTRIES;
		if (overflow <= 0) {
			return;
		}

		const oldestEntries = Array.from(this.summaryCache.entries())
			.sort((a, b) => a[1].timestamp - b[1].timestamp)
			.slice(0, overflow);
		for (const [cacheKey, entry] of oldestEntries) {
			this.removeSummaryEntry(cacheKey, entry);
		}
	}

	private resetStats(): void {
		this.stats = {
			fileHits: 0,
			fileMisses: 0,
			backlinksHits: 0,
			backlinksMisses: 0,
			settingsHits: 0,
			settingsMisses: 0,
			regexHits: 0,
			regexMisses: 0,
			previewHashHits: 0,
			previewHashMisses: 0,
			summaryHits: 0,
			summaryMisses: 0,
		};
	}

	private createAndSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
		const value = new Set<V>();
		map.set(key, value);
		return value;
	}
}

export const cacheManager = InfluxCacheManager.getInstance();

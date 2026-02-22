import { TFile, normalizePath } from 'obsidian';
import { ObsidianInfluxSettings } from '../types/settings';
import { logger } from '../utils/logger';
import type { BacklinksObject } from '../apiAdapter';

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
		if (!entry) return null;

		// Check if cache entry is stale (5 minutes)
		const STALE_TIME = 5 * 60 * 1000;
		if (Date.now() - entry.timestamp > STALE_TIME) {
			this.fileCache.delete(key);
			logger.debug('File cache expired', { path });
			return null;
		}

		return entry.file;
	}

	setFile(path: string, file: TFile): void {
		const key = this.normalizePathKey(path);
		this.fileCache.set(key, {
			file,
			timestamp: Date.now()
		});
		logger.debug('File cached', { path });
	}

	invalidateFile(path: string): void {
		const normalizedPath = this.normalizePathKey(path);
		const dependentTargets = Array.from(this.backlinksTargetsBySource.get(normalizedPath) ?? []);

		this.fileCache.delete(normalizedPath);
		this.backlinksCache.delete(normalizedPath);
		this.previewFileHashes.delete(normalizedPath);
		this.removeDependencyEntriesForTarget(normalizedPath);
		this.backlinksTargetsBySource.delete(normalizedPath);

		for (const targetPath of dependentTargets) {
			if (targetPath === normalizedPath) {
				continue;
			}
			this.backlinksCache.delete(targetPath);
			this.previewFileHashes.delete(targetPath);
			this.removeDependencyEntriesForTarget(targetPath);
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
		if (!entry) return null;

		// Check if cache entry is stale (2 minutes)
		const STALE_TIME = 2 * 60 * 1000;
		if (Date.now() - entry.timestamp > STALE_TIME) {
			this.backlinksCache.delete(key);
			logger.debug('Backlinks cache expired', { path });
			return null;
		}

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

		logger.debug('Backlinks cached', { path });
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
		return this.settingsCache?.settings || null;
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
		logger.info('Settings cache invalidated');
	}

	/**
	 * Regex cache methods
	 */
	getRegex(pattern: string): RegExp | null | undefined {
		const entry = this.regexCache.get(pattern);
		if (!entry) return undefined;

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
		return this.previewFileHashes.get(this.normalizePathKey(path));
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
			}
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

	private createAndSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
		const value = new Set<V>();
		map.set(key, value);
		return value;
	}
}

export const cacheManager = InfluxCacheManager.getInstance();

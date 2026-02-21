import { CachedMetadata, TFile } from 'obsidian';
import { ObsidianInfluxSettings } from '../types/settings';
import { logger } from '../utils/logger';

/**
 * Centralized cache management for Influx plugin
 * Consolidates all caches into a single, coherent system
 */

export interface FileCacheEntry {
	file: TFile;
	timestamp: number;
}

export interface BacklinksCacheEntry {
	backlinks: any;
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

export class InfluxCacheManager {
	private static instance: InfluxCacheManager;

	// File lookups by path
	private fileCache = new Map<string, FileCacheEntry>();

	// Backlinks results by file path
	private backlinksCache = new Map<string, BacklinksCacheEntry>();

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
		const entry = this.fileCache.get(path);
		if (!entry) return null;

		// Check if cache entry is stale (5 minutes)
		const STALE_TIME = 5 * 60 * 1000;
		if (Date.now() - entry.timestamp > STALE_TIME) {
			this.fileCache.delete(path);
			logger.debug('File cache expired', { path });
			return null;
		}

		return entry.file;
	}

	setFile(path: string, file: TFile): void {
		this.fileCache.set(path, {
			file,
			timestamp: Date.now()
		});
		logger.debug('File cached', { path });
	}

	invalidateFile(path: string): void {
		this.fileCache.delete(path);
		this.backlinksCache.delete(path);
		this.previewFileHashes.delete(path);
		logger.debug('File cache invalidated', { path });
	}

	clearFileCache(): void {
		this.fileCache.clear();
		logger.info('File cache cleared');
	}

	/**
	 * Backlinks cache methods
	 */
	getBacklinks(path: string): any | null {
		const entry = this.backlinksCache.get(path);
		if (!entry) return null;

		// Check if cache entry is stale (2 minutes)
		const STALE_TIME = 2 * 60 * 1000;
		if (Date.now() - entry.timestamp > STALE_TIME) {
			this.backlinksCache.delete(path);
			logger.debug('Backlinks cache expired', { path });
			return null;
		}

		return entry.backlinks;
	}

	setBacklinks(path: string, backlinks: any): void {
		this.backlinksCache.set(path, {
			backlinks,
			timestamp: Date.now()
		});
		logger.debug('Backlinks cached', { path });
	}

	clearBacklinksCache(): void {
		this.backlinksCache.clear();
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
	getRegex(pattern: string): RegExp | null {
		const entry = this.regexCache.get(pattern);
		if (!entry) return null;

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
		return this.previewFileHashes.get(path);
	}

	setPreviewFileHash(path: string, hash: string): void {
		this.previewFileHashes.set(path, hash);
	}

	invalidatePreviewFileHash(path: string): void {
		this.previewFileHashes.delete(path);
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
		this.settingsCache = null;
		this.regexCache.clear();
		this.previewFileHashes.clear();
		this.cachedSettingsHash = null;
		logger.info('All caches cleared');
	}

	/**
	 * Get debug information
	 */
	getDebugInfo(): any {
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
			previewFileHashes: {
				size: this.previewFileHashes.size
			}
		};
	}
}

export const cacheManager = InfluxCacheManager.getInstance();

import { TFile } from 'obsidian';
import type { BacklinksObject } from '../../types/backlinks';
import { logger } from '../diagnostics/logger';
import type { CacheStats } from './cache-stats';
import { createAndSet, evictOldestEntries, normalizePathKey } from './cache-store-utils';

interface FileCacheEntry {
	file: TFile;
	timestamp: number;
}

interface BacklinksCacheEntry {
	backlinks: BacklinksObject;
	timestamp: number;
}

interface PreviewHashCacheEntry {
	hash: string;
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

export class FileCacheStore {
	constructor(
		private stats: CacheStats,
		private maxEntries: number,
		private staleTimeMs: number
	) {}

	private fileCache = new Map<string, FileCacheEntry>();

	get(path: string): TFile | null {
		const key = normalizePathKey(path);
		const entry = this.fileCache.get(key);
		if (!entry) {
			this.stats.fileMisses += 1;
			return null;
		}

		if (Date.now() - entry.timestamp > this.staleTimeMs) {
			this.fileCache.delete(key);
			this.stats.fileMisses += 1;
			logger.debug('File cache expired', { path });
			return null;
		}

		this.stats.fileHits += 1;
		return entry.file;
	}

	set(path: string, file: TFile): void {
		this.fileCache.set(normalizePathKey(path), {
			file,
			timestamp: Date.now(),
		});
		evictOldestEntries(this.fileCache, this.maxEntries);
	}

	invalidate(path: string): void {
		this.fileCache.delete(normalizePathKey(path));
	}

	clear(): void {
		this.fileCache.clear();
		logger.info('File cache cleared');
	}

	getDebugInfo(): { size: number; entries: Array<{ path: string; age: number }> } {
		return {
			size: this.fileCache.size,
			entries: Array.from(this.fileCache.entries()).map(([path, entry]) => ({
				path,
				age: Date.now() - entry.timestamp,
			})),
		};
	}
}

export class BacklinksCacheStore {
	constructor(
		private stats: CacheStats,
		private maxEntries: number,
		private staleTimeMs: number
	) {}

	private backlinksCache = new Map<string, BacklinksCacheEntry>();
	private backlinksTargetsBySource = new Map<string, Set<string>>();
	private backlinksSourcesByTarget = new Map<string, Set<string>>();

	get(path: string): BacklinksObject | null {
		const key = normalizePathKey(path);
		const entry = this.backlinksCache.get(key);
		if (!entry) {
			this.stats.backlinksMisses += 1;
			return null;
		}

		if (Date.now() - entry.timestamp > this.staleTimeMs) {
			this.invalidateTarget(key);
			this.stats.backlinksMisses += 1;
			logger.debug('Backlinks cache expired', { path });
			return null;
		}

		this.stats.backlinksHits += 1;
		return entry.backlinks;
	}

	set(path: string, backlinks: BacklinksObject): void {
		const normalizedTarget = normalizePathKey(path);
		this.invalidateTarget(normalizedTarget);

		this.backlinksCache.set(normalizedTarget, {
			backlinks,
			timestamp: Date.now(),
		});

		const sourcePaths = this.extractBacklinksSourcePaths(backlinks);
		const normalizedSources = new Set<string>();

		for (const sourcePath of sourcePaths) {
			const normalizedSource = normalizePathKey(sourcePath);
			if (normalizedSource === normalizedTarget) {
				continue;
			}
			normalizedSources.add(normalizedSource);
			(this.backlinksTargetsBySource.get(normalizedSource) ?? createAndSet(this.backlinksTargetsBySource, normalizedSource)).add(normalizedTarget);
		}

		if (normalizedSources.size > 0) {
			this.backlinksSourcesByTarget.set(normalizedTarget, normalizedSources);
		}

		evictOldestEntries(this.backlinksCache, this.maxEntries, (targetPath) => {
			this.removeDependencyEntriesForTarget(targetPath);
		});
	}

	invalidateTarget(path: string): void {
		const normalizedTarget = normalizePathKey(path);
		this.backlinksCache.delete(normalizedTarget);
		this.removeDependencyEntriesForTarget(normalizedTarget);
	}

	invalidateSource(path: string): string[] {
		const normalizedSource = normalizePathKey(path);
		const dependentTargets = Array.from(this.backlinksTargetsBySource.get(normalizedSource) ?? []);
		this.backlinksTargetsBySource.delete(normalizedSource);

		for (const targetPath of dependentTargets) {
			if (targetPath === normalizedSource) {
				continue;
			}
			this.invalidateTarget(targetPath);
		}

		return dependentTargets;
	}

	clear(): void {
		this.backlinksCache.clear();
		this.backlinksTargetsBySource.clear();
		this.backlinksSourcesByTarget.clear();
		logger.info('Backlinks cache cleared');
	}

	getDebugInfo(): { size: number; entries: Array<{ path: string; age: number }> } {
		return {
			size: this.backlinksCache.size,
			entries: Array.from(this.backlinksCache.entries()).map(([path, entry]) => ({
				path,
				age: Date.now() - entry.timestamp,
			})),
		};
	}

	getDependencyDebugInfo(): { sources: number; targets: number } {
		return {
			sources: this.backlinksTargetsBySource.size,
			targets: this.backlinksSourcesByTarget.size,
		};
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
}

export class PreviewHashCacheStore {
	constructor(private stats: CacheStats, private maxEntries: number) {}

	private previewFileHashes = new Map<string, PreviewHashCacheEntry>();

	get(path: string): string | undefined {
		const entry = this.previewFileHashes.get(normalizePathKey(path));
		if (entry === undefined) {
			this.stats.previewHashMisses += 1;
		} else {
			this.stats.previewHashHits += 1;
		}
		return entry?.hash;
	}

	set(path: string, hash: string): void {
		this.previewFileHashes.set(normalizePathKey(path), {
			hash,
			timestamp: Date.now(),
		});
		evictOldestEntries(this.previewFileHashes, this.maxEntries);
	}

	invalidate(path: string): void {
		this.previewFileHashes.delete(normalizePathKey(path));
	}

	clear(): void {
		this.previewFileHashes.clear();
		logger.info('Preview file hashes cleared');
	}

	getDebugInfo(): { size: number } {
		return { size: this.previewFileHashes.size };
	}
}

export class SummaryCacheStore {
	constructor(
		private stats: CacheStats,
		private maxEntries: number,
		private staleTimeMs: number
	) {}

	private summaryCache = new Map<string, SummaryCacheEntry>();
	private summaryKeysBySource = new Map<string, Set<string>>();
	private summaryKeysByTarget = new Map<string, Set<string>>();

	get(sourcePath: string, sourceMtime: number, targetPath: string, settingsHash: string): SummaryCacheValue | null {
		const cacheKey = this.makeSummaryCacheKey(sourcePath, sourceMtime, targetPath, settingsHash);
		const entry = this.summaryCache.get(cacheKey);
		if (!entry) {
			this.stats.summaryMisses += 1;
			return null;
		}

		if (Date.now() - entry.timestamp > this.staleTimeMs) {
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

	set(sourcePath: string, sourceMtime: number, targetPath: string, settingsHash: string, value: SummaryCacheValue): void {
		const normalizedSource = normalizePathKey(sourcePath);
		const normalizedTarget = normalizePathKey(targetPath);
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

		(this.summaryKeysBySource.get(normalizedSource) ?? createAndSet(this.summaryKeysBySource, normalizedSource)).add(cacheKey);
		(this.summaryKeysByTarget.get(normalizedTarget) ?? createAndSet(this.summaryKeysByTarget, normalizedTarget)).add(cacheKey);

		evictOldestEntries(this.summaryCache, this.maxEntries, (cacheKeyToRemove, entry) => {
			this.removeSummaryEntry(cacheKeyToRemove, entry);
		});
	}

	invalidateSource(path: string): void {
		const keys = this.summaryKeysBySource.get(normalizePathKey(path));
		this.removeSummaryEntries(keys);
	}

	invalidateTarget(path: string): void {
		const keys = this.summaryKeysByTarget.get(normalizePathKey(path));
		this.removeSummaryEntries(keys);
	}

	clear(): void {
		this.summaryCache.clear();
		this.summaryKeysBySource.clear();
		this.summaryKeysByTarget.clear();
		logger.info('Summary cache cleared');
	}

	getDebugInfo(): { size: number; sources: number; targets: number } {
		return {
			size: this.summaryCache.size,
			sources: this.summaryKeysBySource.size,
			targets: this.summaryKeysByTarget.size,
		};
	}

	private makeSummaryCacheKey(sourcePath: string, sourceMtime: number, targetPath: string, settingsHash: string): string {
		const normalizedSource = normalizePathKey(sourcePath);
		const normalizedTarget = normalizePathKey(targetPath);
		return `${normalizedSource}|${sourceMtime}|${normalizedTarget}|${settingsHash}`;
	}

	private removeSummaryEntries(keys: Set<string> | undefined): void {
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
}

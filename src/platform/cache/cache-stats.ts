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

export function createEmptyCacheStats(): CacheStats {
	return {
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

export function resetCacheStats(stats: CacheStats): void {
	Object.assign(stats, createEmptyCacheStats());
}

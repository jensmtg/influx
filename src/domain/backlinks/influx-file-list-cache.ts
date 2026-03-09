import { normalizePath } from 'obsidian';
import { InlinkingFile } from './inlinking-file';

export interface InfluxListBuildResult {
	inlinkingFiles: InlinkingFile[];
	totalEntryCount: number;
}

const RECENT_LIST_BUILD_TTL_MS = 1500;

const inflightListBuilds = new Map<string, Promise<InfluxListBuildResult>>();
const recentListBuilds = new Map<string, { value: InfluxListBuildResult; timestamp: number }>();

function cloneInfluxListBuildResult(result: InfluxListBuildResult): InfluxListBuildResult {
	return {
		inlinkingFiles: [...result.inlinkingFiles],
		totalEntryCount: result.totalEntryCount,
	};
}

export function createEmptyInfluxListBuildResult(): InfluxListBuildResult {
	return {
		inlinkingFiles: [],
		totalEntryCount: 0,
	};
}

export function makeInfluxListBuildCacheKey(
	path: string,
	fileMtime: number,
	settingsHash: string,
	dependencyRevision: number
): string {
	return `${normalizePath(path)}|${fileMtime}|${settingsHash}|${dependencyRevision}`;
}

export function getRecentInfluxListBuild(key: string): InfluxListBuildResult | null {
	const recent = recentListBuilds.get(key);
	if (!recent) {
		return null;
	}

	if (Date.now() - recent.timestamp > RECENT_LIST_BUILD_TTL_MS) {
		recentListBuilds.delete(key);
		return null;
	}

	return cloneInfluxListBuildResult(recent.value);
}

export function getInflightInfluxListBuild(key: string): Promise<InfluxListBuildResult> | null {
	return inflightListBuilds.get(key) ?? null;
}

export function setInflightInfluxListBuild(key: string, buildPromise: Promise<InfluxListBuildResult>): void {
	inflightListBuilds.set(key, buildPromise);
}

export function clearInflightInfluxListBuild(
	key: string,
	buildPromise: Promise<InfluxListBuildResult>
): void {
	if (inflightListBuilds.get(key) === buildPromise) {
		inflightListBuilds.delete(key);
	}
}

export function storeRecentInfluxListBuild(key: string, value: InfluxListBuildResult): void {
	recentListBuilds.set(key, {
		value: cloneInfluxListBuildResult(value),
		timestamp: Date.now(),
	});
	pruneRecentInfluxListBuilds();
}

function pruneRecentInfluxListBuilds(): void {
	const now = Date.now();
	for (const [key, entry] of recentListBuilds.entries()) {
		if (now - entry.timestamp > RECENT_LIST_BUILD_TTL_MS) {
			recentListBuilds.delete(key);
		}
	}
}

export function clearInfluxListBuildCaches(): void {
	inflightListBuilds.clear();
	recentListBuilds.clear();
}

import { normalizePath } from 'obsidian';

export function normalizePathKey(path: string): string {
	return normalizePath(path);
}

export function evictOldestEntries<T extends { timestamp: number }>(
	cache: Map<string, T>,
	maxEntries: number,
	onEvict?: (key: string, value: T) => void
): void {
	const overflow = cache.size - maxEntries;
	if (overflow <= 0) {
		return;
	}

	const oldestEntries = Array.from(cache.entries())
		.sort((a, b) => a[1].timestamp - b[1].timestamp)
		.slice(0, overflow);

	for (const [key, value] of oldestEntries) {
		cache.delete(key);
		onEvict?.(key, value);
	}
}

export function createAndSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
	const value = new Set<V>();
	map.set(key, value);
	return value;
}

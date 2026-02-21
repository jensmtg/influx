/**
 * Type-safe utilities for accessing Obsidian and plugin internals
 * Replaces unsafe 'as any' casts with proper runtime validation
 */

/**
 * Minimal interface for plugin type validation
 * Avoids circular dependency with actual ObsidianInflux class
 */
export interface MinimalPluginInterface {
	data: { settings: any };
	api: { invalidateSettingsCache: () => void };
	app: { metadataCache: unknown };
	isUnloading?: boolean;
}

/**
 * Window interface extension for Influx plugin
 */
interface InfluxWindow extends Window {
	influxPlugin?: MinimalPluginInterface;
	influxDebug?: {
		getReactRoots: () => any;
	};
	testInfluxReadingView?: () => void;
}

/**
 * Safely get the plugin instance from window with type guard
 * Returns null if plugin is not available or invalid
 */
export function getPlugin(): MinimalPluginInterface | null {
	const win = window as InfluxWindow;
	const plugin = win.influxPlugin;

	// Runtime validation
	if (!plugin) {
		return null;
	}

	// Basic structural validation - check for expected properties
	// This prevents type errors if plugin structure changes
	if (!('data' in plugin) || !('api' in plugin) || !('app' in plugin)) {
		return null;
	}

	return plugin;
}

/**
 * Check if plugin is currently unloading
 * Returns true if plugin is marked as unloading
 */
export function isPluginUnloading(): boolean {
	const plugin = getPlugin();
	if (!plugin) {
		return true; // No plugin means it's unloaded
	}

	// Check for isUnloading property (added by plugin.onunload)
	return 'isUnloading' in plugin && (plugin as any).isUnloading === true;
}

/**
 * Check if debug mode is enabled through localStorage or URL parameter
 * Allows enabling debug mode without code changes in production
 */
export function isDebugMode(): boolean {
	// Check localStorage first
	const localStorageDebug = localStorage.getItem('influx-debug-mode');
	if (localStorageDebug !== null) {
		return localStorageDebug === 'true';
	}

	// Check URL parameter
	const urlParams = new URLSearchParams(window.location.search);
	const urlDebug = urlParams.get('influx-debug');
	if (urlDebug !== null) {
		return urlDebug === 'true';
	}

	// Default to false
	return false;
}

/**
 * Remove test/debug functions from window object
 * Called during plugin unload to clean up
 */
export function cleanupWindowGlobals(): void {
	const win = window as InfluxWindow;

	if (win.testInfluxReadingView) {
		delete win.testInfluxReadingView;
	}

	if (win.influxDebug) {
		delete win.influxDebug;
	}

	if (win.influxPlugin) {
		delete win.influxPlugin;
	}
}

/**
 * Type-safe check for Obsidian's getBacklinksForFile method
 */
export function hasBacklinksForFile(metadataCache: unknown): boolean {
	if (!metadataCache || typeof metadataCache !== 'object') {
		return false;
	}

	return 'getBacklinksForFile' in metadataCache &&
		typeof (metadataCache as any).getBacklinksForFile === 'function';
}

/**
 * Get Obsidian's metadata cache with type safety
 */
export function getMetadataCacheSafely(app: { metadataCache: unknown }): unknown {
	return app?.metadataCache ?? null;
}

/**
 * Safely call getBacklinksForFile with error handling
 */
export function getBacklinksForFileSafely(
	metadataCache: unknown,
	file: any
): any {
	if (!hasBacklinksForFile(metadataCache)) {
		return null;
	}

	try {
		return (metadataCache as any).getBacklinksForFile(file);
	} catch (error) {
		// Log error but don't throw - fall back to null
		console.warn('[Influx] Failed to call getBacklinksForFile', { error });
		return null;
	}
}

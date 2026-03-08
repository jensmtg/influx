/**
 * Type-safe utilities for accessing Obsidian and plugin internals
 * Replaces unsafe 'as any' casts with proper runtime validation
 */

import { logger } from '../diagnostics/logger';
import type { BacklinksObject } from '../../types/backlinks';
import type { ObsidianInfluxSettings } from '../../types/settings';
import type { InfluxWindow } from './influx-window-types';

/**
 * Minimal interface for plugin type validation
 * Avoids circular dependency with actual ObsidianInflux class
 */
export interface MinimalPluginInterface {
	data: { settings: ObsidianInfluxSettings };
	api: { invalidateSettingsCache: () => void };
	app: { metadataCache: unknown };
	isUnloading?: boolean;
}

/**
 * Safely get the plugin instance from window with type guard
 * Returns null if plugin is not available or invalid
 */
export function getPlugin(): MinimalPluginInterface | null {
	const win = window as InfluxWindow;
	const plugin = win.influxPlugin;

	// Runtime validation
	if (!plugin || typeof plugin !== 'object') {
		return null;
	}

	// Basic structural validation - check for expected properties
	// This prevents type errors if plugin structure changes
	if (!('data' in plugin) || !('api' in plugin) || !('app' in plugin)) {
		return null;
	}

	return plugin as MinimalPluginInterface;
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
	return 'isUnloading' in plugin && plugin.isUnloading === true;
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
		typeof (metadataCache as { getBacklinksForFile?: unknown }).getBacklinksForFile === 'function';
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
	file: unknown
): BacklinksObject | null {
	if (!hasBacklinksForFile(metadataCache)) {
		return null;
	}

	try {
		return (metadataCache as { getBacklinksForFile: (file: unknown) => BacklinksObject }).getBacklinksForFile(file);
	} catch (error) {
		// Log error but don't throw - fall back to null
		logger.warn('Failed to call getBacklinksForFile', { error });
		return null;
	}
}

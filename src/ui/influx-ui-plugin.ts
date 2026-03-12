import type { ObsidianInfluxSettings } from '../types';

export interface InfluxUiPlugin {
	data: { settings: ObsidianInfluxSettings };
	cycleListLimit: () => Promise<void>;
	toggleSortOrder: () => Promise<void>;
	toggleFrontmatterLinks: () => Promise<void>;
	app?: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function isInfluxUiPlugin(value: unknown): value is InfluxUiPlugin {
	if (!isObjectRecord(value) || !isObjectRecord(value.data) || !('settings' in value.data)) {
		return false;
	}

	return typeof value.cycleListLimit === 'function'
		&& typeof value.toggleSortOrder === 'function'
		&& typeof value.toggleFrontmatterLinks === 'function';
}

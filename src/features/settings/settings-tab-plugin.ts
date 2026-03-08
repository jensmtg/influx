import type { Plugin } from 'obsidian';
import type { ObsidianInfluxSettings } from '../../types';

export interface SettingsTabPlugin extends Plugin {
	data: { settings: ObsidianInfluxSettings };
	saveSettingsByParams: (
		settings: ObsidianInfluxSettings,
		options?: {
			triggerUpdates?: boolean;
			onSuccess?: () => void;
			onFailure?: (error: unknown) => void;
		}
	) => Promise<boolean>;
	openSidebar: () => void;
	closeSidebar: () => void;
}

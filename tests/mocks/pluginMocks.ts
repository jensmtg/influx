/**
 * Shared mock for Obsidian Plugin
 * Provides minimal plugin functionality for testing
 */

import { ObsidianInfluxSettings, DEFAULT_SETTINGS } from '@/types/settings';
import { mockApp } from './obsidianMocks';

export const mockPluginSettings = {
	...DEFAULT_SETTINGS,
	...({} as Partial<ObsidianInfluxSettings>),
};

type MockPlugin = {
	app: typeof mockApp;
	data: {
		settings: ObsidianInfluxSettings;
		children: unknown[];
	};
	api: {
		invalidateSettingsCache: jest.Mock;
	};
	isUnloading: boolean;
	onload: jest.Mock;
	onunload: jest.Mock;
	addSettingTab: jest.Mock;
	registerEvent: jest.Mock;
	registerView: jest.Mock;
};

export const mockPlugin: MockPlugin = {
	app: mockApp,
	data: {
		settings: mockPluginSettings,
		children: [] as unknown[],
	},
	api: {
		invalidateSettingsCache: jest.fn(),
	},
	isUnloading: false,
	onload: jest.fn(),
	onunload: jest.fn(),
	addSettingTab: jest.fn(),
	registerEvent: jest.fn(),
	registerView: jest.fn(),
};

/**
 * Mock plugin with data property typed correctly
 */
export const createMockPlugin = (settingsOverrides: Partial<ObsidianInfluxSettings> = {}) => ({
	...mockPlugin,
	data: {
		settings: { ...mockPluginSettings, ...settingsOverrides },
		children: [] as unknown[],
	},
});

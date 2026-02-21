/**
 * Shared mock for Obsidian Plugin
 * Provides minimal plugin functionality for testing
 */

import { ObsidianInfluxSettings, DEFAULT_SETTINGS } from '../../src/types/settings';
import { mockApp } from './obsidianMocks';

export const mockPluginSettings = {
	...DEFAULT_SETTINGS,
	...({} as Partial<ObsidianInfluxSettings>),
};

export const mockPlugin = {
	app: mockApp,
	data: {
		settings: mockPluginSettings,
		children: [],
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
} as any;

/**
 * Mock plugin with data property typed correctly
 */
export const createMockPlugin = (settingsOverrides: Partial<ObsidianInfluxSettings> = {}) => ({
	...mockPlugin,
	data: {
		settings: { ...mockPluginSettings, ...settingsOverrides },
		children: [],
	},
});

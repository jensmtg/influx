import { ObsidianInfluxSettingsTab } from '@/features/settings/settings-tab';
import { DEFAULT_SETTINGS } from '@/types';

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('ObsidianInfluxSettingsTab', () => {
	const createTab = () => {
		const plugin = {
			data: {
				settings: {
					...DEFAULT_SETTINGS,
				},
			},
			saveData: jest.fn().mockResolvedValue(undefined),
			triggerUpdates: jest.fn(),
			api: {
				invalidateSettingsCache: jest.fn(),
			},
		};

		const app = {};
		return {
			plugin,
			tab: new ObsidianInfluxSettingsTab(app as any, plugin as any),
		};
	};

	test('saveSettings persists plugin data, invalidates cache, and triggers updates', async () => {
		const { tab, plugin } = createTab();

		await tab.saveSettings();

		expect(plugin.saveData).toHaveBeenCalledWith(plugin.data);
		expect(plugin.api.invalidateSettingsCache).toHaveBeenCalledTimes(1);
		expect(plugin.triggerUpdates).toHaveBeenCalledWith('save-settings');
	});

	test('handleFrontmatterPropertiesBlur keeps valid names and marks invalid input', async () => {
		const { tab, plugin } = createTab();

		const warningEl = { textContent: '' };
		const settingContainer = {
			querySelector: jest.fn().mockReturnValue(warningEl),
			appendChild: jest.fn(),
		};
		const inputEl = {
			value: 'related, invalid prop, valid_name, bad-prop!',
			classList: {
				add: jest.fn(),
				remove: jest.fn(),
			},
			closest: jest.fn().mockReturnValue(settingContainer),
		} as any;

		await (tab as any).handleFrontmatterPropertiesBlur(inputEl);

		expect(plugin.data.settings.frontmatterProperties).toEqual(['related', 'valid_name']);
		expect(inputEl.classList.add).toHaveBeenCalledWith('is-invalid');
		expect(warningEl.textContent).toContain('Invalid property names');
		expect(plugin.saveData).toHaveBeenCalledWith(plugin.data);
	});

	test('handleFrontmatterPropertiesBlur clears warning for fully valid input', async () => {
		const { tab, plugin } = createTab();

		const remove = jest.fn();
		const warningEl = { remove };
		const settingContainer = {
			querySelector: jest.fn().mockReturnValue(warningEl),
			appendChild: jest.fn(),
		};
		const inputEl = {
			value: 'related, see_also, references-2',
			classList: {
				add: jest.fn(),
				remove: jest.fn(),
			},
			closest: jest.fn().mockReturnValue(settingContainer),
		} as any;

		await (tab as any).handleFrontmatterPropertiesBlur(inputEl);

		expect(plugin.data.settings.frontmatterProperties).toEqual(['related', 'see_also', 'references-2']);
		expect(inputEl.classList.remove).toHaveBeenCalledWith('is-invalid');
		expect(remove).toHaveBeenCalledTimes(1);
	});
});

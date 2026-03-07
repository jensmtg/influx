import { ObsidianInfluxSettingsTab } from '@/features/settings/settings-tab';
import { DEFAULT_SETTINGS } from '@/types';
import { Setting } from 'obsidian';

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
			openSidebar: jest.fn(),
			closeSidebar: jest.fn(),
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

	test('display renders the main settings sections and expected settings controls', () => {
		const { tab } = createTab();
		const originalDocument = global.document;
		const detailsEl = {
			createEl: jest.fn(),
			createDiv: jest.fn(() => ({ createEl: jest.fn() })),
		};

		jest.clearAllMocks();
		(tab.containerEl.createEl as jest.Mock).mockImplementation((tag: string, options?: { text?: string }) => {
			if (tag === 'details') {
				return detailsEl;
			}
			return {
				tag,
				text: options?.text,
				appendChild: jest.fn(),
				querySelector: jest.fn(),
				createDiv: jest.fn(() => ({ createEl: jest.fn() })),
			};
		});

		(global as typeof globalThis & { document: Document }).document = {
			createDocumentFragment: jest.fn(() => ({ append: jest.fn() } as unknown as DocumentFragment)),
			createElement: jest.fn(() => ({
				href: '',
				text: '',
				classList: { add: jest.fn() },
				style: {},
			}))
		} as unknown as Document;

		try {
			tab.display();
		} finally {
			(global as typeof globalThis & { document?: Document }).document = originalDocument;
		}

		expect(tab.containerEl.empty).toHaveBeenCalledTimes(1);
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Display Mode' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'General Settings' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Styling and layout' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Target notes – in which pages should Influx be visible?' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Source notes – from which notes should Influx gather mentions?' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'On which pages should Influx be collapsed by default?' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Front Matter Link Processing' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('h2', { text: 'Advanced Diagnostics' });
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('details');
		expect(detailsEl.createEl).toHaveBeenCalledWith('summary', {
			text: 'Diagnostics and bug-report tools (advanced)'
		});
		expect(Setting).toHaveBeenCalledTimes(22);
	});

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

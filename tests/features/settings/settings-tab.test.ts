import { ObsidianInfluxSettingsTab } from '@/features/settings/settings-tab';
import { DEFAULT_SETTINGS } from '@/types';
import { App, Setting } from 'obsidian';
import type { SettingsTabPlugin } from '@/features/settings/settings-tab-plugin';

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('ObsidianInfluxSettingsTab', () => {
	type TestableSettingsTab = ObsidianInfluxSettingsTab & {
		handleFrontmatterPropertiesBlur: (inputEl: HTMLInputElement) => Promise<void>;
		applyDisplayModeSetting: (value: string) => Promise<void>;
	};

	type MockInputEl = Pick<HTMLInputElement, 'value' | 'classList' | 'closest'>;
	type MockDocumentFragment = Pick<DocumentFragment, 'append'>;
	type MockDocument = Pick<Document, 'createDocumentFragment' | 'createElement'>;

	const createTab = () => {
		const plugin: SettingsTabPlugin = {
			data: {
				settings: {
					...DEFAULT_SETTINGS,
				},
			},
			saveSettingsByParams: jest.fn(async (settings: typeof DEFAULT_SETTINGS, options?: { triggerUpdates?: boolean; onSuccess?: () => void }) => {
				plugin.data.settings = settings;
				options?.onSuccess?.();
				return true;
			}),
			saveData: jest.fn().mockResolvedValue(undefined),
			triggerUpdates: jest.fn(),
			openSidebar: jest.fn(),
			closeSidebar: jest.fn(),
			addRibbonIcon: jest.fn(),
			addCommand: jest.fn(),
			addStatusBarItem: jest.fn(),
			app: {} as App,
			manifest: { id: 'influx', name: 'Influx', version: 'test', minAppVersion: '1.0.0', description: '', author: '', authorUrl: '', isDesktopOnly: false },
			loadData: jest.fn(),
			saveData: jest.fn().mockResolvedValue(undefined),
			register: jest.fn(),
			registerEvent: jest.fn(),
			registerDomEvent: jest.fn(),
			registerInterval: jest.fn(),
			registerEditorExtension: jest.fn(),
			registerMarkdownPostProcessor: jest.fn(),
			registerView: jest.fn(),
			addSettingTab: jest.fn(),
			onload: jest.fn(),
			onunload: jest.fn(),
			api: {
				invalidateSettingsCache: jest.fn(),
			},
		} as unknown as SettingsTabPlugin;

		const app = {} as App;
		return {
			plugin,
			tab: new ObsidianInfluxSettingsTab(app, plugin) as TestableSettingsTab,
		};
	};

	test('display wires representative settings controls and diagnostics details', () => {
		const { tab } = createTab();
		const originalDocument = global.document;
		const originalSettingImplementation = (Setting as jest.Mock).getMockImplementation();
		const settingNames: string[] = [];
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

		const mockDocument: MockDocument = {
			createDocumentFragment: jest.fn((): MockDocumentFragment => ({ append: jest.fn() })),
			createElement: jest.fn(() => ({
				href: '',
				text: '',
				classList: { add: jest.fn() },
				style: {},
			}))
		};
		(global as typeof globalThis & { document: Document }).document = mockDocument as Document;
		(Setting as jest.Mock).mockImplementation((...args: unknown[]) => {
			const instance = originalSettingImplementation?.(...args) as { setName?: (name: string) => unknown } | undefined;
			if (instance?.setName) {
				const originalSetName = instance.setName.bind(instance);
				instance.setName = (name: string) => {
					settingNames.push(name);
					return originalSetName(name);
				};
			}
			return instance;
		});

		try {
			tab.display();
		} finally {
			if (originalSettingImplementation) {
				(Setting as jest.Mock).mockImplementation(originalSettingImplementation);
			}
			(global as typeof globalThis & { document?: Document }).document = originalDocument;
		}

		expect(tab.containerEl.empty).toHaveBeenCalledTimes(1);
		expect(tab.containerEl.createEl).toHaveBeenCalledWith('details');
		expect(detailsEl.createEl).toHaveBeenCalledWith('summary', {
			text: 'Diagnostics and bug-report tools (advanced)'
		});
		expect(settingNames).toEqual(expect.arrayContaining([
			'Influx display location',
			'Live update',
			'Exclude pages',
			'Frontmatter properties',
			'Enable debug logging',
		]));
	});

	test('saveSettings delegates to plugin transactional settings persistence', async () => {
		const { tab, plugin } = createTab();

		await tab.saveSettings();

		expect(plugin.saveSettingsByParams).toHaveBeenCalledWith(plugin.data.settings, { triggerUpdates: true });
	});

	test('handleFrontmatterPropertiesBlur keeps valid names and marks invalid input', async () => {
		const { tab, plugin } = createTab();

		const warningEl = { textContent: '' };
		const settingContainer = {
			querySelector: jest.fn().mockReturnValue(warningEl),
			appendChild: jest.fn(),
		};
		const inputEl: MockInputEl = {
			value: 'related, invalid prop, valid_name, bad-prop!',
			classList: {
				add: jest.fn(),
				remove: jest.fn(),
			},
			closest: jest.fn().mockReturnValue(settingContainer),
		};

		await tab.handleFrontmatterPropertiesBlur(inputEl as HTMLInputElement);

		expect(plugin.data.settings.frontmatterProperties).toEqual(['related', 'valid_name']);
		expect(inputEl.classList.add).toHaveBeenCalledWith('is-invalid');
		expect(warningEl.textContent).toContain('Invalid property names');
		expect(plugin.saveSettingsByParams).toHaveBeenCalledWith(
			expect.objectContaining({ frontmatterProperties: ['related', 'valid_name'] }),
			expect.objectContaining({ triggerUpdates: true })
		);
	});

	test('handleFrontmatterPropertiesBlur clears warning for fully valid input', async () => {
		const { tab, plugin } = createTab();

		const remove = jest.fn();
		const warningEl = { remove };
		const settingContainer = {
			querySelector: jest.fn().mockReturnValue(warningEl),
			appendChild: jest.fn(),
		};
		const inputEl: MockInputEl = {
			value: 'related, see_also, references-2',
			classList: {
				add: jest.fn(),
				remove: jest.fn(),
			},
			closest: jest.fn().mockReturnValue(settingContainer),
		};

		await tab.handleFrontmatterPropertiesBlur(inputEl as HTMLInputElement);

		expect(plugin.data.settings.frontmatterProperties).toEqual(['related', 'see_also', 'references-2']);
		expect(inputEl.classList.remove).toHaveBeenCalledWith('is-invalid');
		expect(remove).toHaveBeenCalledTimes(1);
	});

	test('display mode only opens sidebar after settings save succeeds', async () => {
		const { tab, plugin } = createTab();
		plugin.saveSettingsByParams.mockResolvedValueOnce(false);

		await tab.applyDisplayModeSetting('sidebar');

		expect(plugin.openSidebar).not.toHaveBeenCalled();
		expect(plugin.data.settings.showInfluxInSidebar).toBe(false);
	});
});

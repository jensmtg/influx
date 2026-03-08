import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { ObsidianInfluxSettings } from '../../types';
import { validateYamlPropertyNames } from '../../domain/settings/filtering';
import { isDebugMode, setDebugMode } from '../../platform/diagnostics/debug-mode';
import type { SettingsTabPlugin } from './settings-tab-plugin';
import {
	SETTINGS_SECTIONS,
	type DropdownFieldSpec,
	type PatternSettingName,
	type SettingsFieldSpec,
	type SettingsSectionSpec,
	type ToggleFieldSpec,
} from './settings-tab-schema';

const REGEX_HELP_URL =
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
const PATTERN_PLACEHOLDER = '^Templates/\n^Daily/\nProject-.+';

export class ObsidianInfluxSettingsTab extends PluginSettingTab {
    plugin: SettingsTabPlugin;

    constructor(app: App, plugin: SettingsTabPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async saveSettings(): Promise<boolean> {
        return await this.plugin.saveSettingsByParams(this.plugin.data.settings, { triggerUpdates: true });
    }

	private async saveSettingsWithNotice(
		settings: ObsidianInfluxSettings,
		options?: { onSuccess?: () => void }
	): Promise<boolean> {
		const didSave = await this.plugin.saveSettingsByParams(settings, {
			triggerUpdates: true,
			onSuccess: options?.onSuccess,
		});
		if (!didSave) {
			new Notice('Failed to save settings. Check console for details.');
		}
		return didSave;
	}

    private async setSetting<K extends keyof ObsidianInfluxSettings>(
        settingName: K,
        value: ObsidianInfluxSettings[K]
    ): Promise<void> {
		await this.saveSettingsWithNotice(
			{ ...this.plugin.data.settings, [settingName]: value },
		)
	}

	private async saveFrontmatterProperties(properties: string[]): Promise<void> {
		await this.saveSettingsWithNotice(
			{ ...this.plugin.data.settings, frontmatterProperties: properties },
		);
    }

	private createRegexHelpFragment(prefix: string): DocumentFragment {
		const fragment = document.createDocumentFragment();
		fragment.append(prefix + ' ');
		fragment.append('Matches note paths. Use one pattern per line. Changes are saved when the field loses focus. See ');

        const link = document.createElement('a');
        link.href = REGEX_HELP_URL;
        link.text = 'MDN - Regular expressions';

        fragment.append(link);
        fragment.append(' for help.');

        return fragment;
    }

    private addPatternTextAreaSetting(
        containerEl: HTMLElement,
        title: string,
        descriptionPrefix: string,
        settingName: PatternSettingName
    ): void {
        new Setting(containerEl)
            .setName(title)
            .setDesc(this.createRegexHelpFragment(descriptionPrefix))
            .addTextArea((textArea) => {
                textArea.inputEl.setAttr('rows', 6);
                textArea
                    .setPlaceholder(PATTERN_PLACEHOLDER)
                    .setValue(this.plugin.data.settings[settingName].join('\n'));
                textArea.inputEl.onblur = (e: FocusEvent) => {
                    this.handlePatternBlur(e, settingName);
                };
            });
    }

    private showFrontmatterWarning(inputEl: HTMLInputElement, message: string): void {
        inputEl.classList.add('is-invalid');
        const settingContainer = inputEl.closest('.setting-item');

        let warningEl = settingContainer?.querySelector('.frontmatter-warning');
        if (!warningEl && settingContainer) {
            warningEl = document.createElement('div');
            warningEl.classList.add('frontmatter-warning', 'setting-item-description');
            (warningEl as HTMLElement).style.color = 'var(--text-warning)';
            (warningEl as HTMLElement).style.fontSize = '0.9em';
            (warningEl as HTMLElement).style.marginTop = '0.5em';
            settingContainer.appendChild(warningEl);
        }

        if (warningEl) {
            warningEl.textContent = message;
        }
    }

    private clearFrontmatterWarning(inputEl: HTMLInputElement): void {
        inputEl.classList.remove('is-invalid');
        const settingContainer = inputEl.closest('.setting-item');
        const warningEl = settingContainer?.querySelector('.frontmatter-warning');
        if (warningEl) {
            warningEl.remove();
        }
    }

    private async handleFrontmatterPropertiesBlur(inputEl: HTMLInputElement): Promise<void> {
        const properties = inputEl.value
            .split(',')
            .map((prop) => prop.trim())
            .filter((prop) => prop.length > 0);

        const validationResult = validateYamlPropertyNames(properties);

        if (validationResult.invalid.length > 0) {
            const warningMsg = `Invalid property names: ${validationResult.invalid.join(', ')}. Valid names must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens.`;
            this.showFrontmatterWarning(inputEl, warningMsg);
			await this.saveFrontmatterProperties(validationResult.valid);
        } else {
            this.clearFrontmatterWarning(inputEl);
			await this.saveFrontmatterProperties(properties);
        }
    }

    /**
     * Helper method to handle textarea onblur events for pattern settings.
     */
    private handlePatternBlur(e: FocusEvent, settingName: PatternSettingName): void {
        const patterns = (e.target as HTMLInputElement).value.split('\n');
        void this.setSetting(settingName, patterns);
    }

	private createFrontmatterPropertiesDescription(): DocumentFragment {
		const fragment = document.createDocumentFragment();
		fragment.append('Comma-separated list of frontmatter property names to read links from. ');
		fragment.append('Leave this blank to include links from every frontmatter property. ');
		fragment.append('Example: "related,see_also,references". ');
		fragment.append('Valid names: letters, numbers, underscores, hyphens only (no spaces).');
		return fragment;
	}

	private async applyDisplayModeSetting(value: string): Promise<void> {
		const showInSidebar = value === 'sidebar';
		await this.saveSettingsWithNotice(
			{ ...this.plugin.data.settings, showInfluxInSidebar: showInSidebar },
			{
				onSuccess: () => {
					if (showInSidebar) {
						this.plugin.openSidebar();
					} else {
						this.plugin.closeSidebar();
					}
				},
			}
		);
	}

	private createSettingControlContainer(containerEl: HTMLElement, section: SettingsSectionSpec): HTMLElement {
		containerEl.createEl('h2', { text: section.title });
		if (!section.detailsSummary) {
			return containerEl;
		}

		const detailsEl = containerEl.createEl('details');
		detailsEl.createEl('summary', { text: section.detailsSummary });
		const detailsContainer = detailsEl.createDiv();
		if (section.detailsIntro) {
			detailsContainer.createEl('p', { text: section.detailsIntro });
		}
		return detailsContainer;
	}

	private renderToggleField(containerEl: HTMLElement, field: ToggleFieldSpec): void {
		new Setting(containerEl)
			.setName(field.name)
			.setDesc(field.description)
			.addToggle((toggle) => {
				toggle
					.setValue(field.getValue ? field.getValue(this.plugin.data.settings) : Boolean(this.plugin.data.settings[field.setting!]))
					.onChange(async (value) => {
						if (field.onChange) {
							await field.onChange(value);
							return;
						}

						const nextValue = field.transform ? field.transform(value) : value;
						await this.setSetting(field.setting!, nextValue as ObsidianInfluxSettings[keyof ObsidianInfluxSettings]);
					});
			});
	}

	private renderDropdownField(containerEl: HTMLElement, field: DropdownFieldSpec): void {
		new Setting(containerEl)
			.setName(field.name)
			.setDesc(field.description)
			.addDropdown((dropdown) => {
				field.options.forEach((option) => {
					dropdown.addOption(option.value, option.label);
				});

				dropdown
					.setValue(field.getValue ? field.getValue(this.plugin.data.settings) : String(this.plugin.data.settings[field.setting!]))
					.onChange(async (value) => {
						if (field.onChange) {
							await field.onChange(value);
							return;
						}

						const parsed = field.parse ? field.parse(value) : value;
						if (parsed === undefined) {
							return;
						}

						await this.setSetting(field.setting!, parsed as ObsidianInfluxSettings[keyof ObsidianInfluxSettings]);
					});
			});
	}

	private renderFrontmatterPropertiesField(containerEl: HTMLElement, field: SettingsFieldSpec): void {
		new Setting(containerEl)
			.setName(field.name)
			.setDesc(this.createFrontmatterPropertiesDescription())
			.addText((text) => {
				text
					.setPlaceholder('related, see_also, references')
					.setValue(this.plugin.data.settings.frontmatterProperties.join(', '));

				text.inputEl.onblur = (e: FocusEvent) => {
					const inputEl = e.target as HTMLInputElement;
					void this.handleFrontmatterPropertiesBlur(inputEl);
				};
			});
	}

	private renderDebugToggleField(containerEl: HTMLElement, field: SettingsFieldSpec): void {
		new Setting(containerEl)
			.setName(field.name)
			.setDesc(field.description)
			.addToggle((toggle) => {
				toggle
					.setValue(isDebugMode())
					.onChange((value) => {
						setDebugMode(value);
						new Notice(value ? 'Influx debug logging enabled.' : 'Influx debug logging disabled.');
					});
			});
	}

	private renderField(containerEl: HTMLElement, field: SettingsFieldSpec): void {
		switch (field.kind) {
			case 'toggle':
				this.renderToggleField(containerEl, field);
				return;
			case 'dropdown':
				this.renderDropdownField(containerEl, field);
				return;
			case 'patternTextArea':
				this.addPatternTextAreaSetting(containerEl, field.name, field.description, field.setting);
				return;
			case 'frontmatterProperties':
				this.renderFrontmatterPropertiesField(containerEl, field);
				return;
			case 'debugToggle':
				this.renderDebugToggleField(containerEl, field);
				return;
		}
	}

	private renderSection(containerEl: HTMLElement, section: SettingsSectionSpec): void {
		const settingsContainer = this.createSettingControlContainer(containerEl, section);
		for (const field of section.fields) {
			if (field.kind === 'dropdown' && field.name === 'Influx display location') {
				this.renderDropdownField(settingsContainer, {
					...field,
					onChange: async (value) => this.applyDisplayModeSetting(value),
				});
				continue;
			}
			this.renderField(settingsContainer, field);
		}
	}

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

		SETTINGS_SECTIONS.forEach((section) => {
			this.renderSection(containerEl, section);
		});
    }
}

import ObsidianInflux from './main';
import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { ObsidianInfluxSettings } from './types';
import { logger } from './utils/logger';
import { validateYamlPropertyNames } from './settings-utils';
import { isDebugMode, setDebugMode } from './utils/debug-mode';

type PatternSettingName =
    | 'exclusionPattern'
    | 'inclusionPattern'
    | 'sourceExclusionPattern'
    | 'sourceInclusionPattern'
    | 'collapsedPattern';

const REGEX_HELP_URL =
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
const PATTERN_PLACEHOLDER = '^templates/\n20\\d\\d\nmenu\nMenu';

export class ObsidianInfluxSettingsTab extends PluginSettingTab {
    plugin: ObsidianInflux;

    constructor(app: App, plugin: ObsidianInflux) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async saveSettings(): Promise<void> {
        await this.plugin.saveData(this.plugin.data);
        // Invalidate settings cache to ensure fresh settings are used
        this.plugin.api.invalidateSettingsCache();
        this.plugin.triggerUpdates('save-settings');
    }

    private async saveSettingsSafely(): Promise<void> {
        try {
            await this.saveSettings();
        } catch (err) {
            logger.error('Failed to save settings', { error: err });
            new Notice('Failed to save settings. Check console for details.');
        }
    }

    private async setSetting<K extends keyof ObsidianInfluxSettings>(
        settingName: K,
        value: ObsidianInfluxSettings[K]
    ): Promise<void> {
        this.plugin.data.settings[settingName] = value;
        await this.saveSettingsSafely();
    }

    private createRegexHelpFragment(prefix: string): DocumentFragment {
        const fragment = document.createDocumentFragment();
        fragment.append(prefix + ' ');
        fragment.append('One pattern per line. See ');

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
            this.plugin.data.settings.frontmatterProperties = validationResult.valid;
        } else {
            this.clearFrontmatterWarning(inputEl);
            this.plugin.data.settings.frontmatterProperties = properties;
        }

        await this.saveSettingsSafely();
    }

    /**
     * Helper method to handle textarea onblur events for pattern settings.
     */
    private handlePatternBlur(e: FocusEvent, settingName: PatternSettingName): void {
        const patterns = (e.target as HTMLInputElement).value.split('\n');
        void this.setSetting(settingName, patterns);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Display Mode' });

        new Setting(containerEl)
            .setName('Influx display location')
            .setDesc('Choose where Influx backlinks should be displayed.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('inline', 'Inline - embedded in documents')
                    .addOption('sidebar', 'Sidebar - right sidebar panel')
                    .setValue(this.plugin.data.settings.showInfluxInSidebar ? 'sidebar' : 'inline')
                    .onChange(async (value) => {
                        const showInSidebar = value === 'sidebar';
                        this.plugin.data.settings.showInfluxInSidebar = showInSidebar;
                        await this.saveSettingsSafely();

                        if (showInSidebar) {
                            this.plugin.openSidebar();
                        } else {
                            this.plugin.closeSidebar();
                        }

                        // Keep existing explicit extra refresh behavior.
                        this.plugin.triggerUpdates('save-settings');
                    });
            });

        containerEl.createEl('h2', { text: 'General Settings' });

        new Setting(containerEl)
            .setName('Live update')
            .setDesc('With live update enabled, changes in a note are immediately reflected in Influx components where that note appears. (This can reduce overall performance.)')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.data.settings.liveUpdate)
                    .onChange(async (value) => {
                        await this.setSetting('liveUpdate', value);
                    });
            });

        new Setting(containerEl)
            .setName('Sorting principle')
            .setDesc('Order notes in which direction from the top.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('NEWEST_FIRST', 'Newest first')
                    .addOption('OLDEST_FIRST', 'Oldest first')
                    .setValue(this.plugin.data.settings.sortingPrinciple)
                    .onChange(async (value) => {
                        if (value === 'NEWEST_FIRST' || value === 'OLDEST_FIRST') {
                            await this.setSetting('sortingPrinciple', value);
                        }
                    });
            });

        new Setting(containerEl)
            .setName('Sorting attribute')
            .setDesc('Order notes according to which attribute.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('ctime', 'By date created')
                    .addOption('mtime', 'By date last modified')
                    .addOption('FILENAME', 'By filename')
                    .setValue(this.plugin.data.settings.sortingAttribute)
                    .onChange(async (value) => {
                        if (value === 'ctime' || value === 'mtime' || value === 'FILENAME') {
                            await this.setSetting('sortingAttribute', value);
                        }
                    });
            });

        new Setting(containerEl)
            .setName('List length')
            .setDesc('Maximum number of entries to show in an Influx list initially.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('0', 'No limit')
                    .addOption('5', '5')
                    .addOption('10', '10')
                    .addOption('15', '15')
                    .addOption('25', '25')
                    .addOption('50', '50')
                    .setValue(this.plugin.data.settings.listLimit.toString())
                    .onChange(async (value) => {
                        await this.setSetting('listLimit', Number(value));
                    });
            });

        containerEl.createEl('h2', { text: 'Styling and layout' });

        new Setting(containerEl)
            .setName('Font size')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('16', 'Normal')
                    .addOption('13', 'Small')
                    .addOption('11', 'Smaller')
                    .addOption('10', 'Smallest')
                    .setValue(this.plugin.data.settings.fontSize.toString())
                    .onChange(async (value) => {
                        await this.setSetting('fontSize', Number(value));
                    });
            });

        new Setting(containerEl)
            .setName('Layout variant')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('CENTER_ALIGNED', 'Continous stream')
                    .addOption('ROWS', 'Note by note')
                    .setValue(this.plugin.data.settings.variant)
                    .onChange(async (value) => {
                        if (value === 'CENTER_ALIGNED' || value === 'ROWS') {
                            await this.setSetting('variant', value);
                        }
                    });
            });

        new Setting(containerEl)
            .setName('Show Influx below text')
            .setDesc('If disabled, Influx will be shown above the note body instead.')
            .addToggle((toggle) => {
                toggle
                    .setValue(!this.plugin.data.settings.influxAtTopOfPage)
                    .onChange(async (value) => {
                        await this.setSetting('influxAtTopOfPage', !value);
                    });
            });

        new Setting(containerEl)
            .setName('Show headers')
            .setDesc('Influx will use the topmost markdown-formatted header it can find in a page.')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.data.settings.entryHeaderVisible)
                    .onChange(async (value) => {
                        await this.setSetting('entryHeaderVisible', value);
                    });
            });

        containerEl.createEl('h2', { text: 'Target notes – in which pages should Influx be visible?' });

        new Setting(containerEl)
            .setName('Require frontmatter key')
            .setDesc("Only show Influx on pages that have 'influx: true' in their frontmatter. When enabled, this setting overrides the pattern matching settings below.")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.data.settings.requireInfluxFrontmatterKey)
                    .onChange(async (value) => {
                        await this.setSetting('requireInfluxFrontmatterKey', value);
                    });
            });

        new Setting(containerEl)
            .setName('Default behaviour')
            .setDesc('Configure Influx to either be shown on all pages by default - and then define specifically which pages it should be excluded from, or to not be shown on any pages by default - and then define specifically which pages it should be included in.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('OPT_OUT', 'Show on all pages')
                    .addOption('OPT_IN', 'Show on no pages')
                    .setValue(this.plugin.data.settings.showBehaviour)
                    .onChange(async (value) => {
                        if (value === 'OPT_OUT' || value === 'OPT_IN') {
                            await this.setSetting('showBehaviour', value);
                        }
                    });
            });

        this.addPatternTextAreaSetting(
            containerEl,
            'Exclude pages',
            'RegExp patterns for pathnames of notes where the Influx component should not be shown.',
            'exclusionPattern'
        );

        this.addPatternTextAreaSetting(
            containerEl,
            'Include pages',
            'RegExp patterns for pathnames of notes where the Influx component should be shown.',
            'inclusionPattern'
        );

        containerEl.createEl('h2', { text: 'Source notes – from which notes should Influx gather mentions?' });

        new Setting(containerEl)
            .setName('Default behaviour')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('OPT_OUT', 'Include all notes')
                    .addOption('OPT_IN', 'Exclude all notes')
                    .setValue(this.plugin.data.settings.sourceBehaviour)
                    .onChange(async (value) => {
                        if (value === 'OPT_OUT' || value === 'OPT_IN') {
                            await this.setSetting('sourceBehaviour', value);
                        }
                    });
            });

        this.addPatternTextAreaSetting(
            containerEl,
            'Exclude notes',
            'RegExp patterns for pathnames of notes that should not be shown in any Influx.',
            'sourceExclusionPattern'
        );

        this.addPatternTextAreaSetting(
            containerEl,
            'Include notes',
            'RegExp patterns for pathnames of notes that should be shown in Influx in relevant pages.',
            'sourceInclusionPattern'
        );

        containerEl.createEl('h2', { text: 'In which pages should Influx be collapsed by default?' });

        new Setting(containerEl)
            .setName('Collapse all by default')
            .setDesc('Automatically collapse all backlink entries when opening a note. When enabled, this overrides the regex pattern settings below.')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.data.settings.collapseAllByDefault)
                    .onChange(async (value) => {
                        await this.setSetting('collapseAllByDefault', value);
                    });
            });

        this.addPatternTextAreaSetting(
            containerEl,
            'Collapsed in pages',
            'RegExp patterns for pathnames of notes where the list of backlinked clippings in the Influx component should be collapsed by default.',
            'collapsedPattern'
        );

        containerEl.createEl('h2', { text: 'Front Matter Link Processing' });

        new Setting(containerEl)
            .setName('Include links from front matter properties')
            .setDesc('Process Obsidian links found in front matter properties and include them in backlinks.')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.data.settings.includeFrontmatterLinks)
                    .onChange(async (value) => {
                        await this.setSetting('includeFrontmatterLinks', value);
                    });
            });

        const frontmatterPropertiesFragment = document.createDocumentFragment();
        frontmatterPropertiesFragment.append('Comma-separated list of front matter property names to include links from. ');
        frontmatterPropertiesFragment.append('Leave blank to include links from all front matter properties. ');
        frontmatterPropertiesFragment.append('Example: "related,see_also,references". ');
        frontmatterPropertiesFragment.append('Valid names: letters, numbers, underscores, hyphens only (no spaces).');

        new Setting(containerEl)
            .setName('Front matter properties')
            .setDesc(frontmatterPropertiesFragment)
            .addText((text) => {
                text
                    .setPlaceholder('related, see_also, references')
                    .setValue(this.plugin.data.settings.frontmatterProperties.join(', '));

                text.inputEl.onblur = (e: FocusEvent) => {
                    const inputEl = e.target as HTMLInputElement;
                    void this.handleFrontmatterPropertiesBlur(inputEl);
                };
            });

        containerEl.createEl('h2', { text: 'Advanced Diagnostics' });

        const diagnosticsDetails = containerEl.createEl('details');
        diagnosticsDetails.createEl('summary', {
            text: 'Diagnostics and bug-report tools (advanced)'
        });
        const diagnosticsContainer = diagnosticsDetails.createDiv();

        diagnosticsContainer.createEl('p', {
            text: 'These options are intended for troubleshooting and issue reports, not normal usage.'
        });

        new Setting(diagnosticsContainer)
            .setName('Enable debug logging')
            .setDesc('Enables verbose debug logs in the developer console.')
            .addToggle((toggle) => {
                toggle
                    .setValue(isDebugMode())
                    .onChange((value) => {
                        setDebugMode(value);
                        new Notice(value ? 'Influx debug logging enabled.' : 'Influx debug logging disabled.');
                    });
            });

        new Setting(diagnosticsContainer)
            .setName('Enable performance metrics')
            .setDesc('Captures minimal timing metrics and includes them in debug logs and window.influxDebug.getMetrics().')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.data.settings.metricsEnabled)
                    .onChange(async (value) => {
                        await this.setSetting('metricsEnabled', value);
                    });
            });
    }
}

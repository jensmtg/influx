import ObsidianInflux from './main';
import { App, PluginSettingTab, Setting } from "obsidian";

export class ObsidianInfluxSettingsTab extends PluginSettingTab {

    plugin: ObsidianInflux;

    constructor(app: App, plugin: ObsidianInflux) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();


        containerEl.createEl('h2', { text: 'General Settings' });


        new Setting(containerEl)
            .setName("Sorting principle")
            .setDesc("Order notes in which direction from the top.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('NEWEST_FIRST', 'Newest first')
                    .addOption('OLDEST_FIRST', 'Oldest first')
                    .setValue(this.plugin.settings.sortingPrinciple)
                    .onChange(async (value) => {
                        if (value === 'NEWEST_FIRST' || value === 'OLDEST_FIRST') {
                            this.plugin.settings.sortingPrinciple = value;
                            await this.plugin.saveSettings();
                        }
                    });
            })

        new Setting(containerEl)
            .setName("Sorting attribute")
            .setDesc("Order notes according to which attribute.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('ctime', 'By date created')
                    .addOption('mtime', 'By date last modified')
                    .setValue(this.plugin.settings.sortingAttribute)
                    .onChange(async (value) => {
                        if (value === 'ctime' || value === 'mtime') {
                            this.plugin.settings.sortingAttribute = value;
                            await this.plugin.saveSettings();
                        }
                    });

            })

        new Setting(containerEl)
            .setName("List length")
            .setDesc("Maximum number of entries to show in an Influx list initially.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('0', 'No limit')
                    .addOption('5', '5')
                    .addOption('10', '10')
                    .addOption('15', '15')
                    .addOption('25', '25')
                    .addOption('50', '50')

                    .setValue(this.plugin.settings.listLimit.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.listLimit = Number(value);
                        await this.plugin.saveSettings();

                    });

            })

        containerEl.createEl('h2', { text: 'Styling' });

        new Setting(containerEl)
            .setName("Font size")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('16', 'Normal')
                    .addOption('13', 'Small')
                    .addOption('11', 'Smaller')
                    .addOption('10', 'Smallest')
                    .setValue(this.plugin.settings.fontSize.toString())
                    .onChange(async (value) => {
                        this.plugin.settings.fontSize = Number(value);
                        await this.plugin.saveSettings();

                    });

            })

        new Setting(containerEl)
            .setName("Layout variant")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('CENTER_ALIGNED', 'Center aligned')
                    .addOption('ROWS', 'Plain rows')
                    .setValue(this.plugin.settings.variant)
                    .onChange(async (value) => {
                        if (value === 'CENTER_ALIGNED' || value === 'ROWS') {
                            this.plugin.settings.variant = value;
                            await this.plugin.saveSettings();
                        }
                    });

            })


        containerEl.createEl('h2', { text: 'Show or hide Influx component' });


        new Setting(containerEl)
            .setName("Default behaviour")
            .setDesc("Configure Influx to either be shown on all pages by default - and then define specifically which pages it should be excluded from, or to not be shown on any pages by default - and then define specifically which pages it should be included in.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('OPT_OUT', 'Show on all pages')
                    .addOption('OPT_IN', 'Show on no pages')
                    .setValue(this.plugin.settings.showBehaviour)
                    .onChange(async (value) => {
                        if (value === 'OPT_OUT' || value === 'OPT_IN') {
                            this.plugin.settings.showBehaviour = value;
                            await this.plugin.saveSettings();
                        }
                    });

            })


        const exclusionFragment = document.createDocumentFragment();
        exclusionFragment.append('RegExp patterns for pathnames of notes where the Influx component should not be shown. ')
        exclusionFragment.append('One pattern per line. See ');
        const exclusionLink = document.createElement('a');
        exclusionLink.href =
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
        exclusionLink.text = 'MDN - Regular expressions';
        exclusionFragment.append(exclusionLink);
        exclusionFragment.append(' for help.');

        new Setting(containerEl)
            .setName('Exclude pages')
            .setDesc(exclusionFragment)
            .addTextArea((textArea) => {
                textArea.inputEl.setAttr('rows', 6);
                textArea
                    .setPlaceholder('^templates/\n20\\d\\d\nmenu\nMenu')
                    .setValue(this.plugin.settings.exclusionPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.settings.exclusionPattern = patterns.split('\n');
                    await this.plugin.saveSettings();
                };
            });


        const inclusionFragment = document.createDocumentFragment();
        inclusionFragment.append('RegExp patterns for pathnames of notes where the Influx component should be shown. ')
        inclusionFragment.append('One pattern per line. See ');
        const inclusionLink = document.createElement('a');
        inclusionLink.href =
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
        inclusionLink.text = 'MDN - Regular expressions';
        inclusionFragment.append(inclusionLink);
        inclusionFragment.append(' for help.');

        new Setting(containerEl)
            .setName('Include pages')
            .setDesc(inclusionFragment)
            .addTextArea((textArea) => {
                textArea.inputEl.setAttr('rows', 6);
                textArea
                    .setPlaceholder('^templates/\n20\\d\\d\nmenu\nMenu')
                    .setValue(this.plugin.settings.inclusionPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.settings.inclusionPattern = patterns.split('\n');
                    await this.plugin.saveSettings();
                };
            });


        containerEl.createEl('h2', { text: 'Collapse Influx component' });

        const collapseFragment = document.createDocumentFragment();
        collapseFragment.append('RegExp patterns for pathnames of notes where the list of backlinked clippings in the Influx component should be collapsed by default. ')
        collapseFragment.append('One pattern per line. See ');
        const collapseLink = document.createElement('a');
        collapseLink.href =
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
        collapseLink.text = 'MDN - Regular expressions';
        collapseFragment.append(collapseLink);
        collapseFragment.append(' for help.');

        new Setting(containerEl)
            .setName('Collapsed in pages')
            .setDesc(collapseFragment)
            .addTextArea((textArea) => {
                textArea.inputEl.setAttr('rows', 6);
                textArea
                    .setPlaceholder('^templates/\n20\\d\\d\nmenu\nMenu')
                    .setValue(this.plugin.settings.collapsedPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.settings.collapsedPattern = patterns.split('\n');
                    await this.plugin.saveSettings();
                };
            });

    }
}
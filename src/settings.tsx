import ObsidianInflux from './main';
import { App, PluginSettingTab, Setting } from "obsidian";

export class ObsidianInfluxSettingsTab extends PluginSettingTab {

    plugin: ObsidianInflux;

    constructor(app: App, plugin: ObsidianInflux) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async saveSettings() {
        await this.plugin.saveData(this.plugin.data);
        this.plugin.triggerUpdates('save-settings')
    }


    display(): void {
        const { containerEl } = this;

        containerEl.empty();


        containerEl.createEl('h2', { text: 'General Settings' });


        new Setting(containerEl)
        .setName("Live update")
        .setDesc("With live update enabled, changes in a note is immediately reflected in Infux components where that note appears. (This can reduce overall performance.)")
        .addToggle(toggle => {
            toggle
                .setValue(this.plugin.data.settings.liveUpdate)
                .onChange(async (value) => {
                    this.plugin.data.settings.liveUpdate = value;
                    await this.saveSettings()
                });
        })


        new Setting(containerEl)
            .setName("Sorting principle")
            .setDesc("Order notes in which direction from the top.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('NEWEST_FIRST', 'Newest first')
                    .addOption('OLDEST_FIRST', 'Oldest first')
                    .setValue(this.plugin.data.settings.sortingPrinciple)
                    .onChange(async (value) => {
                        if (value === 'NEWEST_FIRST' || value === 'OLDEST_FIRST') {
                            this.plugin.data.settings.sortingPrinciple = value;
                            await this.saveSettings()
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
                    .addOption('FILENAME', 'By filename')
                    .setValue(this.plugin.data.settings.sortingAttribute)
                    .onChange(async (value) => {
                        if (value === 'ctime' || value === 'mtime' || value === 'FILENAME') {
                            this.plugin.data.settings.sortingAttribute = value;
                            await this.saveSettings()
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

                    .setValue(this.plugin.data.settings.listLimit.toString())
                    .onChange(async (value) => {
                        this.plugin.data.settings.listLimit = Number(value);
                        await this.saveSettings()

                    });

            })

        containerEl.createEl('h2', { text: 'Styling and layout' });

        new Setting(containerEl)
            .setName("Font size")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('16', 'Normal')
                    .addOption('13', 'Small')
                    .addOption('11', 'Smaller')
                    .addOption('10', 'Smallest')
                    .setValue(this.plugin.data.settings.fontSize.toString())
                    .onChange(async (value) => {
                        this.plugin.data.settings.fontSize = Number(value);
                        await this.saveSettings()

                    });

            })

        new Setting(containerEl)
            .setName("Layout variant")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('CENTER_ALIGNED', 'Continous stream')
                    .addOption('ROWS', 'Note by note')
                    .setValue(this.plugin.data.settings.variant)
                    .onChange(async (value) => {
                        if (value === 'CENTER_ALIGNED' || value === 'ROWS') {
                            this.plugin.data.settings.variant = value;
                            await this.saveSettings()
                        }
                    });

            })

            new Setting(containerEl)
            .setName("Show Influx below text")
            .setDesc("If disabled, Influx will be shown above the note body instead.")
            .addToggle(toggle => {
                toggle
                    .setValue(!this.plugin.data.settings.influxAtTopOfPage)
                    .onChange(async (value) => {
                        this.plugin.data.settings.influxAtTopOfPage = !value;
                        await this.saveSettings()
                    });
            })

        new Setting(containerEl)
            .setName("Show headers")
            .setDesc("Influx will use the topmost markdown-formatted header it can find in a page.")
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.data.settings.entryHeaderVisible)
                    .onChange(async (value) => {
                        this.plugin.data.settings.entryHeaderVisible = value;
                        await this.saveSettings()
                    });
            })


        containerEl.createEl('h2', { text: 'Target notes – in which pages should Influx be visible?' });


        new Setting(containerEl)
            .setName("Default behaviour")
            .setDesc("Configure Influx to either be shown on all pages by default - and then define specifically which pages it should be excluded from, or to not be shown on any pages by default - and then define specifically which pages it should be included in.")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('OPT_OUT', 'Show on all pages')
                    .addOption('OPT_IN', 'Show on no pages')
                    .setValue(this.plugin.data.settings.showBehaviour)
                    .onChange(async (value) => {
                        if (value === 'OPT_OUT' || value === 'OPT_IN') {
                            this.plugin.data.settings.showBehaviour = value;
                            await this.saveSettings()
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
                    .setValue(this.plugin.data.settings.exclusionPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.data.settings.exclusionPattern = patterns.split('\n');
                    await this.saveSettings()
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
                    .setValue(this.plugin.data.settings.inclusionPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.data.settings.inclusionPattern = patterns.split('\n');
                    await this.saveSettings()
                };
            });



        containerEl.createEl('h2', { text: 'Source notes – from which notes should Influx gather mentions?' });


        new Setting(containerEl)
            .setName("Default behaviour")
            .addDropdown(dropdown => {
                dropdown
                    .addOption('OPT_OUT', 'Include all notes')
                    .addOption('OPT_IN', 'Exclude all notes')
                    .setValue(this.plugin.data.settings.sourceBehaviour)
                    .onChange(async (value) => {
                        if (value === 'OPT_OUT' || value === 'OPT_IN') {
                            this.plugin.data.settings.sourceBehaviour = value;
                            await this.saveSettings()
                        }
                    });

            })


        const sourceExclusionFragment = document.createDocumentFragment();
        sourceExclusionFragment.append('RegExp patterns for pathnames of notes that should not be shown in any Influx. ')
        sourceExclusionFragment.append('One pattern per line. See ');
        const sourceExclusionLink = document.createElement('a');
        sourceExclusionLink.href =
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
        sourceExclusionLink.text = 'MDN - Regular expressions';
        sourceExclusionFragment.append(sourceExclusionLink);
        sourceExclusionFragment.append(' for help.');

        new Setting(containerEl)
            .setName('Exclude notes')
            .setDesc(sourceExclusionFragment)
            .addTextArea((textArea) => {
                textArea.inputEl.setAttr('rows', 6);
                textArea
                    .setPlaceholder('^templates/\n20\\d\\d\nmenu\nMenu')
                    .setValue(this.plugin.data.settings.sourceExclusionPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.data.settings.sourceExclusionPattern = patterns.split('\n');
                    await this.saveSettings()
                };
            });


        const sourceInclusionFragment = document.createDocumentFragment();
        sourceInclusionFragment.append('RegExp patterns for pathnames of notes that should be shown in Influx in relevant pages. ')
        sourceInclusionFragment.append('One pattern per line. See ');
        const sourceInclusionLink = document.createElement('a');
        sourceInclusionLink.href =
            'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#writing_a_regular_expression_pattern';
        sourceInclusionLink.text = 'MDN - Regular expressions';
        sourceInclusionFragment.append(sourceInclusionLink);
        sourceInclusionFragment.append(' for help.');

        new Setting(containerEl)
            .setName('Include notes')
            .setDesc(sourceInclusionFragment)
            .addTextArea((textArea) => {
                textArea.inputEl.setAttr('rows', 6);
                textArea
                    .setPlaceholder('^templates/\n20\\d\\d\nmenu\nMenu')
                    .setValue(this.plugin.data.settings.sourceInclusionPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.data.settings.sourceInclusionPattern = patterns.split('\n');
                    await this.saveSettings()
                };
            });



        containerEl.createEl('h2', { text: 'In which pages should Influx be collapsed by default?' });

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
                    .setValue(this.plugin.data.settings.collapsedPattern.join('\n'));
                textArea.inputEl.onblur = async (e: FocusEvent) => {
                    const patterns = (e.target as HTMLInputElement).value;
                    this.plugin.data.settings.collapsedPattern = patterns.split('\n');
                    await this.saveSettings()
                };
            });


    }
}
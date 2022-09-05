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


        new Setting(containerEl)
            .setName("Newest first")
            .setDesc("Order notes so that the newest are shown at the top.")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.newestFirst)
                    .onChange(async (value) => {
                        this.plugin.settings.newestFirst = value;
                        await this.plugin.saveSettings();
                    })
            })


        new Setting(containerEl)
            .setName("Sort by time created")
            .setDesc("Order notes according to time created (Disable to sort according to time modified).")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.byTimeCreated)
                    .onChange(async (value) => {
                        this.plugin.settings.byTimeCreated = value;
                        await this.plugin.saveSettings();
                    })
            })

    }
}
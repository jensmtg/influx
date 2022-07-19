import { Plugin } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt  } from './cm6/asyncViewPlugin';


interface ObsidianInfluxSettings {
	dateFormat: string;
}

const DEFAULT_SETTINGS: Partial<ObsidianInfluxSettings> = {
	dateFormat: "YYYY-MM-DD",
};



export default class ObsidianInflux extends Plugin {

	settings: ObsidianInfluxSettings;

	async onload(): Promise<void> {
		
		this.registerEditorExtension(asyncDecoBuilderExt)

		await this.loadSettings();
		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		// this.addRibbonIcon("diagram", "Devrun", () => this.prepareData());
		this.addCommand({
			id: 'devrun',
			name: 'devrun',
			callback: () => {
				// this.prepareData()
				// this.addButtonInEdit(app)
			}
		})

	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onunload() {
	}

}


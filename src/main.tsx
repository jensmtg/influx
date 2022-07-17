import { Plugin, Vault, Workspace, MarkdownPostProcessorContext } from 'obsidian';
import * as React from "react";
import { createRoot } from "react-dom/client";
import InfluxReactComponent from './InfluxReactComponent';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';
import { ObsidianInfluxSettingsTab } from './settings';



interface ObsidianInfluxSettings {
	dateFormat: string;
}

const DEFAULT_SETTINGS: Partial<ObsidianInfluxSettings> = {
	dateFormat: "YYYY-MM-DD",
};

export default class ObsidianInflux extends Plugin {

	settings: ObsidianInfluxSettings;
	vault: Vault;
	workspace: Workspace;
	anchor: any;
	apiAdapter: ApiAdapter;


	async onload() {

		this.vault = this.app.vault;
		this.workspace = this.app.workspace;
		this.apiAdapter = new ApiAdapter(this.app)

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


		this.registerMarkdownCodeBlockProcessor('influx', async (source, el, ctx) => {
			this.processInfluxCodeblock(source, el, ctx)
		})

	}


	async processInfluxCodeblock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {

		if (el && ctx.sourcePath) {

			const influxFile = new InfluxFile(ctx.sourcePath, this.apiAdapter)
			await influxFile.makeInfluxList()

			const div = el.createEl("div");
			this.anchor = createRoot(div)
			this.anchor.render(<InfluxReactComponent influxFile={influxFile} api={this.apiAdapter} />);

		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onunload() {
		if (this.anchor) {
			this.anchor.unmount();
		}
	}

}



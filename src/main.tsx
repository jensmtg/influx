import { Plugin, Vault, Workspace, App, MarkdownPostProcessorContext, PluginSettingTab, Setting } from 'obsidian';
import * as React from "react";
import { createRoot } from "react-dom/client";
import InfluxReactComponent from './InfluxReactComponent';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';


interface MyPluginSettings {
	mySetting: string;
}

// const DEFAULT_SETTINGS: MyPluginSettings = {
// 	mySetting: 'default'
// }

export default class ObsidianInflux extends Plugin {

	settings: MyPluginSettings;
	vault: Vault;
	workspace: Workspace;
	anchor: any;
	apiAdapter: ApiAdapter;


	async onload() {

		this.vault = this.app.vault;
		this.workspace = this.app.workspace;
		this.apiAdapter = new ApiAdapter(this.app)


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
			this.anchor.render(<InfluxReactComponent influxFile={influxFile} />);

		}
	}



	async onunload() {
		if (this.anchor) {
			this.anchor.unmount();
		}
	}

}



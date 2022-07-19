import { App, Plugin, Vault, Workspace, MarkdownPostProcessorContext, MarkdownView, EventRef } from 'obsidian';
import * as React from "react";
import { createRoot } from "react-dom/client";
import InfluxReactComponent from './InfluxReactComponent';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';
import { ObsidianInfluxSettingsTab } from './settings';
import { Extension } from '@codemirror/state';
import { asyncDecoBuilderExt  } from './cm6/asyncViewPlugin';


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
	private widgetInEdit: EventRef;
	private cmExtension: Extension;


	async onload(): Promise<void> {

		this.vault = this.app.vault;
		this.workspace = this.app.workspace;
		this.apiAdapter = new ApiAdapter(this.app)
		

		/** registerCodeMirror affects legacy editor (codemirror 5.) */
		this.widgetInEdit = openFileListener(
			this.app,
			this.addWidget.bind(this)
		)
		this.registerCodeMirror((cm: CodeMirror.Editor) => {
			console.log('REGISTER', cm)
			
		})

		// Setup "code mirror 6" editor
		// this.cmExtension = testExtension()
		// const x = images()
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


		this.registerMarkdownCodeBlockProcessor('influx', async (source, el, ctx) => {
			this.processInfluxCodeblock(source, el, ctx)
		})

	}



	private async addWidget(app: App) {

		const span = document.createElement("span");
		span.textContent = '😀'
		span.className = "cm-rendered-emoji";

		let widget: CodeMirror.LineWidget
		if (widget) {
			widget.clear()
		}

		const activeView = app.workspace.getActiveViewOfType(MarkdownView)

		if (activeView) {
			this.registerCodeMirror((cm: CodeMirror.Editor) => {
				widget = cm.addLineWidget(0, span)
			})
		}
	}


	async processInfluxCodeblock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {

		// return // TODO: temp.

		if (el && ctx.sourcePath) {

			const influxFile = new InfluxFile(ctx.sourcePath, this.apiAdapter)
			await influxFile.makeInfluxList()
			await influxFile.renderAllMarkdownBlocks()

			const div = el.createEl("div");
			this.anchor = createRoot(div)
			this.anchor.render(<InfluxReactComponent influxFile={influxFile} />);

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



export const openFileListener = (
	app: App,
	callback: (app: App) => void
  ): EventRef => {
	return app.workspace.on("file-open", () => {
		callback(app);
	});
  };
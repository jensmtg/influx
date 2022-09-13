import { Plugin } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt } from './cm6/asyncViewPlugin';


export interface ObsidianInfluxSettings {
	sortingPrinciple: 'NEWEST_FIRST' | 'OLDEST_FIRST';
	sortingAttribute: 'ctime' | 'mtime'; // created or modified.
	showBehaviour: 'OPT_OUT' | 'OPT_IN';
	exclusionPattern: string[];
	inclusionPattern: string[];
	collapsedPattern: string[];
	listLimit: number;
	variant: 'CENTER_ALIGNED' | 'ROWS';
	fontSize: number;

}

const DEFAULT_SETTINGS: Partial<ObsidianInfluxSettings> = {
	sortingPrinciple: 'NEWEST_FIRST',
	sortingAttribute: 'ctime',
	showBehaviour: 'OPT_OUT',
	exclusionPattern: [],
	inclusionPattern: [],
	collapsedPattern: [],
	listLimit: 0,
	variant: 'CENTER_ALIGNED',
	fontSize: 13,
};



export default class ObsidianInflux extends Plugin {

	settings: ObsidianInfluxSettings;

	async onload(): Promise<void> {

		await this.loadSettings();

		this.registerEditorExtension(asyncDecoBuilderExt)

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		this.registerEvent(this.app.vault.on('modify', (file) => { console.log('modified', file); this.redraw() }));
		this.registerEvent(this.app.vault.on('rename', (file) => { console.log('rename', file); this.redraw() }));
		this.registerEvent(this.app.vault.on('delete', (file) => { console.log('delete', file); this.redraw() }));

	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onunload() {
	}

	redraw() {
		console.log('redraw')
		// const views = this.app.workspace.iterateAllLeaves()
		this.app.workspace.iterateRootLeaves(leaf => {

			const leafType: 'preview' | 'source' = leaf.view?.currentMode?.type

			if (leafType === 'preview') {

				console.log('leaf', leaf.view?.currentMode?.type)
				console.log('leaf2', leaf.view?.file)
				console.log('leaf3', leaf)

				const div = document.createElement("div")
				const textnode = document.createTextNode("Influx goes here!");
				div.setAttr("id", "influx-component")
				div.appendChild(textnode)
				const container: HTMLDivElement = leaf.containerEl
				const sel = container.querySelector(".markdown-preview-section");
				const host = sel.childNodes[sel.childNodes.length - 1]
				console.log('sel', sel)
				console.log('host', host)

				host.appendChild(div)

			}


			/** 
			 * TODO.
			 * This spike implementation proves the possibility of access to update
			 * preview leaves upon relevant triggers (opening, editing).
			 * Next steps:
			 * - Access to refresh editor leaves in the same vein as well.
			 * - More complete logic:
			 *   - considerRerenders triggered by different signals (editing, rename)
			 *   - evaulate each root leaf
			 *   - if preview:
			 *     - if force rerender (settings changes)
			 *     - if file is, or has backlink to, signal origin
			 *     - produce and render a influx component and place it instead or anew.
			 *   - if source:
			 *     - if force rerender (settings changes)
			 *     - if has backlink to signal origin
			 *     - force refresh of leaf (or influx component only?)
			 */

		})
		// console.log('views', views)
	}

}


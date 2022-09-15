import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt } from './cm6/asyncViewPlugin';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { ApiAdapter } from './apiAdapter';

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

export type ComponentCallback = (op: string, file?: TFile) => void


export default class ObsidianInflux extends Plugin {

	settings: ObsidianInfluxSettings;
	componentCallbacks: { [key: string]: ComponentCallback };

	async onload(): Promise<void> {

		this.componentCallbacks = {}

		await this.loadSettings();

		this.registerEditorExtension(asyncDecoBuilderExt)

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		this.registerEvent(this.app.vault.on('modify', (file: TAbstractFile) => { this.triggerUpdates('modify', file) }));
		this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile) => { this.triggerUpdates('rename', file) }));
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => { this.triggerUpdates('delete', file) }));
		this.registerEvent(this.app.workspace.on('file-open', (file: TAbstractFile) => { this.triggerUpdates('file-open', file) }));
		this.registerEvent(this.app.workspace.on('layout-change', () => { this.triggerUpdates('layout-change') }));

	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onunload() {
	}

	registerInfluxComponent(id: string, callback: ComponentCallback) {
		if (!(id in this.componentCallbacks)) {
			this.componentCallbacks[id] = callback
		}
	}

	deregisterInfluxComponent(id: string) {
		if (id in this.componentCallbacks) {
			delete this.componentCallbacks[id]
		}
	}


	triggerUpdates(op: string, file?: TAbstractFile) {

		console.log('-->', op)

		const _file = file instanceof TFile ? file : null

		Object.values(this.componentCallbacks).forEach(callback => callback(op, _file))

		this.app.workspace.iterateRootLeaves(leaf => {

			// @ts-ignore
			const leafType: string = leaf.view?.currentMode?.type

			if (leafType === 'preview') {

				this.updatePreview(leaf)
				// TODO: Modifiy InfluxReactComponent so it can handle both preview and source.

			}

		})
	}

	async updatePreview(leaf: WorkspaceLeaf) {
		// console.log('leaf2', leaf.view?.file)
		// console.log('leaf3', leaf)

		const div = document.createElement("div")
		const textnode = document.createTextNode("Influx goes here?");
		div.setAttr("id", "influx-component")
		div.appendChild(textnode)

		// @ts-ignore
		const container: HTMLDivElement = leaf.containerEl
		const sel = container.querySelector(".markdown-preview-section");
		const host = sel.childNodes[sel.childNodes.length - 1]


		// host.appendChild(div)
		if (host) {
			const apiAdapter = new ApiAdapter(app)
			const influxFile = new InfluxFile(leaf.view?.file.path, apiAdapter, this)
			await influxFile.makeInfluxList()
			await influxFile.renderAllMarkdownBlocks()
			const reactAnchor = host.appendChild(document.createElement('div'))
			const anchor = createRoot(reactAnchor)
			const rand = Math.random()
			anchor.render(<InfluxReactComponent key={rand} rand={rand} influxFile={influxFile} />);

		}



	}

}


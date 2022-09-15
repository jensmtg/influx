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
		// this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile) => { this.triggerUpdates('rename', file) }));
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
				// TODO: Avoid concurrency, and multiple calls to updatePreviewInflux simultaneously.
				this.updatePreviewInflux(leaf)
			}

		})
	}

	async updatePreviewInflux(leaf: WorkspaceLeaf) {

		// @ts-ignore
		const container: HTMLDivElement = leaf.containerEl

		const influxContainers = container.getElementsByTagName("influx-preview-container")

		if (influxContainers.length) {
			const previewDiv = influxContainers[0].parentElement

			for (let i = 0; i < influxContainers.length; i++) {
				influxContainers[i].remove()
			}
			this.drawInfluxInPreview(leaf, previewDiv)

		}

		else {
			const previewDiv = container.querySelector(".markdown-preview-section");
			if (previewDiv) {
				this.drawInfluxInPreview(leaf, previewDiv)
			}



		}

	}

	async drawInfluxInPreview(leaf: WorkspaceLeaf, container: Node) {
		const apiAdapter = new ApiAdapter(app)
		// @ts-ignore
		const influxFile = new InfluxFile(leaf.view?.file.path, apiAdapter, this)
		await influxFile.makeInfluxList()
		await influxFile.renderAllMarkdownBlocks()
		const influxContainer = document.createElement("influx-preview-container")
		influxContainer.id = influxFile.id
		container.appendChild(influxContainer)

		const anchor = createRoot(influxContainer)
		const rand = Math.random()

		anchor.render(<InfluxReactComponent
			key={rand}
			rand={rand}
			influxFile={influxFile}
			preview={true}
		/>);

	}
}




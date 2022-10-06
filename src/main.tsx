import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt } from './cm6/asyncViewPlugin';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { ApiAdapter } from './apiAdapter';
import { createStyleSheet, StyleSheetType } from './createStyleSheet';


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
	entryHeaderVisible: boolean;

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
	entryHeaderVisible: true,
};

export type ComponentCallback = (op: string, file: TFile, stylesheet: StyleSheetType) => void



export default class ObsidianInflux extends Plugin {

	settings: ObsidianInfluxSettings;
	componentCallbacks: { [key: string]: ComponentCallback };
	updating: boolean;
	stylesheet: StyleSheetType;
	api: ApiAdapter;

	async onload(): Promise<void> {

		this.componentCallbacks = {}
		this.updating = false
		this.api = new ApiAdapter(this.app)
		this.stylesheet = createStyleSheet(this.api)

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

		const _file = file instanceof TFile ? file : null

		this.stylesheet = createStyleSheet(this.api)

		Object.values(this.componentCallbacks).forEach(callback => callback(op, _file, this.stylesheet))

		// this.updateInfluxInAllPreviews()

	}

	async updateInfluxInAllPreviews() {
		/**
		 * ! This is a best-effort feature to maintain a live-updated
		 * ! influx footer in preview mode pages. It's buggy.
		 */
		const previewLeaves: WorkspaceLeaf[] = []

		this.app.workspace.iterateRootLeaves(leaf => {
			// @ts-ignore
			const leafType: string = leaf.view?.currentMode?.type
			if (leafType === 'preview') {
				previewLeaves.push(leaf)
			}
		})

		if (this.updating) {
			return
		}

		else {
			this.updating = true
			try {
				await Promise.all(previewLeaves.map(leaf => this.updateInfluxInPreview(leaf)))
			}
			catch (e) {
				// console.warn(e)
			}
			finally {
				this.updating = false
			}
		}
	}

	async updateInfluxInPreview(leaf: WorkspaceLeaf) {
		// eslint-disable-next-line no-async-promise-executor
		return new Promise(async (resolve, reject) => {

			// @ts-ignore
			const container: HTMLDivElement = leaf.containerEl

			const previewDiv = container.querySelector(".markdown-preview-section");

			if (!previewDiv) {
				reject('No preview found')
			}

			const apiAdapter = new ApiAdapter(app)
			// @ts-ignore
			const influxFile = new InfluxFile(leaf.view?.file.path, apiAdapter, this)
			await influxFile.makeInfluxList()
			await influxFile.renderAllMarkdownBlocks()

			// Remove any existing influx blocks after async flows
			this.removeInfluxFromPreview(leaf)

			const influxContainer = document.createElement("influx-preview-container")
			influxContainer.id = influxFile.id
			previewDiv.lastChild.appendChild(influxContainer)

			const anchor = createRoot(influxContainer)
			const rand = Math.random()

			anchor.render(<InfluxReactComponent
				key={rand}
				rand={rand}
				influxFile={influxFile}
				preview={true}
				sheet={this.stylesheet}
			/>);
			resolve('Ok')
		})




	}

	removeInfluxFromPreview(leaf: WorkspaceLeaf) {

		// @ts-ignore
		const container: HTMLDivElement = leaf.containerEl

		const influxContainers = container.getElementsByTagName("influx-preview-container")

		if (influxContainers.length) {

			for (let i = 0; i < influxContainers.length; i++) {
				influxContainers[i].remove()
			}

		}


	}

}
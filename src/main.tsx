import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt } from './cm6/asyncViewPlugin';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { ApiAdapter } from './apiAdapter';
import { createStyleSheet, StyleSheetType } from './createStyleSheet';
import { EditorView } from '@codemirror/view';

export interface ObsidianInfluxSettings {
	liveUpdate: boolean;
	sortingPrinciple: 'NEWEST_FIRST' | 'OLDEST_FIRST';
	sortingAttribute: 'ctime' | 'mtime' | 'FILENAME'; // created or modified.
	showBehaviour: 'OPT_OUT' | 'OPT_IN';
	exclusionPattern: string[];
	inclusionPattern: string[];
	collapsedPattern: string[];
	sourceBehaviour: 'OPT_OUT' | 'OPT_IN';
	sourceInclusionPattern: string[];
	sourceExclusionPattern: string[];
	listLimit: number;
	variant: 'CENTER_ALIGNED' | 'ROWS';
	fontSize: number;
	entryHeaderVisible: boolean;
	influxAtTopOfPage: boolean;
}

export const DEFAULT_SETTINGS: Partial<ObsidianInfluxSettings> = {
	liveUpdate: true,
	sortingPrinciple: 'NEWEST_FIRST',
	sortingAttribute: 'ctime',
	showBehaviour: 'OPT_OUT',
	exclusionPattern: [],
	inclusionPattern: [],
	collapsedPattern: [],
	sourceBehaviour: 'OPT_OUT',
	sourceInclusionPattern: [],
	sourceExclusionPattern: [],
	listLimit: 0,
	variant: 'CENTER_ALIGNED',
	fontSize: 13,
	entryHeaderVisible: true,
	influxAtTopOfPage: false,
};

export type ComponentCallback = (op: string, stylesheet: StyleSheetType, file?: TFile) => void
export interface Data {
	settings: ObsidianInfluxSettings,
}


export default class ObsidianInflux extends Plugin {

	componentCallbacks: { [key: string]: ComponentCallback };
	updating: boolean;
	stylesheet: StyleSheetType;
	stylesheetForPreview: StyleSheetType;
	api: ApiAdapter;
	data: Data;
	delayedShowCallbacks: { editor: EditorView, callback: () => void, time: number }[] = [];

	async onload(): Promise<void> {

		this.componentCallbacks = {}
		this.updating = false
		this.api = new ApiAdapter(this.app)
		this.stylesheet = createStyleSheet(this.api)
		this.stylesheetForPreview = createStyleSheet(this.api, true)
		this.data = await this.loadDataInitially()

		this.registerEditorExtension(asyncDecoBuilderExt)

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

		this.registerEvent(this.app.vault.on('modify', (file: TAbstractFile) => { this.triggerUpdates('modify', file) }));
		// this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile) => { this.triggerUpdates('rename', file) }));
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => { this.triggerUpdates('delete', file) }));
		this.registerEvent(this.app.workspace.on('file-open', (file: TAbstractFile) => { this.triggerUpdates('file-open', file) }));
		this.registerEvent(this.app.workspace.on('layout-change', () => { this.triggerUpdates('layout-change') }));

		setInterval(this.tick.bind(this), 1000)
	}

	public delayShowInflux(editor: EditorView, showCallback: () => void) {
		this.delayedShowCallbacks = this.delayedShowCallbacks.filter(cb => cb.editor !== editor)
		this.delayedShowCallbacks.push({
			editor: editor,
			time: Date.now(),
			callback: showCallback
		})
	}

	private tick() {

		const now = Date.now()
		const remaining: { editor: EditorView, callback: () => void, time: number }[] = []

		this.delayedShowCallbacks.forEach((cb => {
			if (now > cb.time + 2000 ) {
				cb.callback()
			}
			else {
				remaining.push(cb)
			}
		}))

		this.delayedShowCallbacks = remaining


	}


	async loadDataInitially() {
		const _data = await this.loadData()
		const data: Data = {
			settings: Object.assign({}, DEFAULT_SETTINGS, _data?.settings),
		}
		return data
	}


	toggleSortOrder() {
		const newOrder = this.data.settings.sortingPrinciple === 'NEWEST_FIRST' ? 'OLDEST_FIRST' : 'NEWEST_FIRST'
		this.data.settings.sortingPrinciple = newOrder;
		this.saveSettingsByParams({ ...this.data.settings, "sortingPrinciple": newOrder })
	}

	async saveSettingsByParams(settings: ObsidianInfluxSettings) {
		await this.saveData({ ...this.data, settings: settings });
		this.triggerUpdates('save-settings')
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

		if (op === 'modify') {
			if (this.data.settings.liveUpdate && file instanceof TFile) {
				this.stylesheet = createStyleSheet(this.api)
				Object.values(this.componentCallbacks).forEach(callback => callback(op, this.stylesheet, file))
				// this.updateInfluxInAllPreviews()
			}
		}
		else {
			this.stylesheet = createStyleSheet(this.api)
			// this.stylesheetForPreview = createStyleSheet(this.api, true)
			Object.values(this.componentCallbacks).forEach(callback => callback(op, this.stylesheet))
			this.updateInfluxInAllPreviews()
		}
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

			const previewDiv = container.querySelector(".markdown-preview-view");

			if (!previewDiv) {
				reject('No preview found')
				return
			}

			const apiAdapter = new ApiAdapter(this.app)
			// @ts-ignore
			const path = leaf.view?.file.path
			if (!path) {
				reject('No file path found')
				return
			}
			const influxFile = new InfluxFile(path, apiAdapter, this)
			await influxFile.makeInfluxList()
			await influxFile.renderAllMarkdownBlocks()

			// Remove any existing influx blocks after async flows
			this.removeInfluxFromPreview(leaf)

			// Create a wrapper div that will be positioned at the bottom of the content
			const influxWrapper = document.createElement("div");
			influxWrapper.className = "influx-preview-wrapper";

			const influxContainer = document.createElement("influx-preview-container");
			influxContainer.id = influxFile.uuid;
			influxWrapper.appendChild(influxContainer);
			
			// Append to the preview view directly
			previewDiv.appendChild(influxWrapper);

			const anchor = createRoot(influxContainer);

			anchor.render(<InfluxReactComponent
				influxFile={influxFile}
				preview={true}
				sheet={this.stylesheetForPreview}
			/>);
			resolve('Ok');
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
import { Plugin } from 'obsidian';
import { ObsidianInfluxSettingsTab } from './settings';
import { asyncDecoBuilderExt  } from './cm6/asyncViewPlugin';


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
	exclusionPattern:[],
	inclusionPattern:[],
	collapsedPattern:[],
	listLimit: 0,
	variant: 'CENTER_ALIGNED',
	fontSize: 13,
};



export default class ObsidianInflux extends Plugin {

	settings: ObsidianInfluxSettings;

	async onload(): Promise<void> {
		
		this.registerEditorExtension(asyncDecoBuilderExt)

		await this.loadSettings();

		this.addSettingTab(new ObsidianInfluxSettingsTab(this.app, this));

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


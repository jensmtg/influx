export interface ObsidianInfluxSettings {
	liveUpdate: boolean;
	sortingPrinciple: 'NEWEST_FIRST' | 'OLDEST_FIRST';
	sortingAttribute: 'ctime' | 'mtime' | 'FILENAME';
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
	includeFrontmatterLinks: boolean;
	frontmatterProperties: string[];
}

export const DEFAULT_SETTINGS: ObsidianInfluxSettings = {
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
	includeFrontmatterLinks: false,
	frontmatterProperties: [],
};

export interface Data {
	settings: ObsidianInfluxSettings;
}

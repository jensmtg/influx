import type { ObsidianInfluxSettings } from '../../types';

export type PatternSettingName =
	| 'exclusionPattern'
	| 'inclusionPattern'
	| 'sourceExclusionPattern'
	| 'sourceInclusionPattern'
	| 'collapsedPattern';

export interface SettingsOption {
	value: string;
	label: string;
}

interface SettingsFieldSpecBase {
	name: string;
	description: string;
}

export interface ToggleFieldSpec<K extends keyof ObsidianInfluxSettings = keyof ObsidianInfluxSettings>
	extends SettingsFieldSpecBase {
	kind: 'toggle';
	setting?: K;
	getValue?: (settings: ObsidianInfluxSettings) => boolean;
	transform?: (value: boolean) => ObsidianInfluxSettings[K];
	onChange?: (value: boolean) => Promise<void> | void;
}

export interface DropdownFieldSpec<K extends keyof ObsidianInfluxSettings = keyof ObsidianInfluxSettings>
	extends SettingsFieldSpecBase {
	kind: 'dropdown';
	setting?: K;
	options: SettingsOption[];
	getValue?: (settings: ObsidianInfluxSettings) => string;
	parse?: (value: string) => ObsidianInfluxSettings[K] | undefined;
	onChange?: (value: string) => Promise<void> | void;
}

export interface PatternTextAreaFieldSpec extends SettingsFieldSpecBase {
	kind: 'patternTextArea';
	setting: PatternSettingName;
}

export interface FrontmatterPropertiesFieldSpec extends SettingsFieldSpecBase {
	kind: 'frontmatterProperties';
}

export interface DebugToggleFieldSpec extends SettingsFieldSpecBase {
	kind: 'debugToggle';
}

export type SettingsFieldSpec =
	| ToggleFieldSpec
	| DropdownFieldSpec
	| PatternTextAreaFieldSpec
	| FrontmatterPropertiesFieldSpec
	| DebugToggleFieldSpec;

export interface SettingsSectionSpec {
	title: string;
	detailsSummary?: string;
	detailsIntro?: string;
	fields: SettingsFieldSpec[];
}

export const SETTINGS_SECTIONS: SettingsSectionSpec[] = [
	{
		title: 'Display Mode',
		fields: [
			{
				kind: 'dropdown',
				name: 'Influx display location',
				description: 'Choose where Influx backlinks should be displayed.',
				options: [
					{ value: 'inline', label: 'Inline - embedded in documents' },
					{ value: 'sidebar', label: 'Sidebar - right sidebar panel' },
				],
				getValue: (settings) => (settings.showInfluxInSidebar ? 'sidebar' : 'inline'),
				onChange: async () => undefined,
			},
		],
	},
	{
		title: 'General Settings',
		fields: [
			{
				kind: 'toggle',
				name: 'Live update',
				description: 'With live update enabled, changes in a note are immediately reflected in Influx components where that note appears. (This can reduce overall performance.)',
				setting: 'liveUpdate',
			},
			{
				kind: 'dropdown',
				name: 'Sorting principle',
				description: 'Order notes in which direction from the top.',
				setting: 'sortingPrinciple',
				options: [
					{ value: 'NEWEST_FIRST', label: 'Newest first' },
					{ value: 'OLDEST_FIRST', label: 'Oldest first' },
				],
				parse: (value) => (value === 'NEWEST_FIRST' || value === 'OLDEST_FIRST' ? value : undefined),
			},
			{
				kind: 'dropdown',
				name: 'Sorting attribute',
				description: 'Order notes according to which attribute.',
				setting: 'sortingAttribute',
				options: [
					{ value: 'ctime', label: 'By date created' },
					{ value: 'mtime', label: 'By date last modified' },
					{ value: 'FILENAME', label: 'By filename' },
				],
				parse: (value) => (value === 'ctime' || value === 'mtime' || value === 'FILENAME' ? value : undefined),
			},
			{
				kind: 'dropdown',
				name: 'List length',
				description: 'Maximum number of entries to show in an Influx list initially.',
				setting: 'listLimit',
				options: [
					{ value: '0', label: 'No limit' },
					{ value: '5', label: '5' },
					{ value: '10', label: '10' },
					{ value: '15', label: '15' },
					{ value: '25', label: '25' },
					{ value: '50', label: '50' },
				],
				getValue: (settings) => settings.listLimit.toString(),
				parse: (value) => Number(value),
			},
		],
	},
	{
		title: 'Styling and layout',
		fields: [
			{
				kind: 'dropdown',
				name: 'Font size',
				description: '',
				setting: 'fontSize',
				options: [
					{ value: '16', label: 'Normal' },
					{ value: '13', label: 'Small' },
					{ value: '11', label: 'Smaller' },
					{ value: '10', label: 'Smallest' },
				],
				getValue: (settings) => settings.fontSize.toString(),
				parse: (value) => Number(value),
			},
			{
				kind: 'dropdown',
				name: 'Layout variant',
				description: '',
				setting: 'variant',
				options: [
					{ value: 'CENTER_ALIGNED', label: 'Continuous stream' },
					{ value: 'ROWS', label: 'Note by note' },
				],
				parse: (value) => (value === 'CENTER_ALIGNED' || value === 'ROWS' ? value : undefined),
			},
			{
				kind: 'toggle',
				name: 'Show Influx below text',
				description: 'If disabled, Influx will be shown above the note body instead.',
				setting: 'influxAtTopOfPage',
				getValue: (settings) => !settings.influxAtTopOfPage,
				transform: (value) => !value,
			},
			{
				kind: 'toggle',
				name: 'Show headers',
				description: 'Influx will use the topmost markdown-formatted header it can find in a page.',
				setting: 'entryHeaderVisible',
			},
		],
	},
	{
		title: 'Target notes – in which pages should Influx be visible?',
		fields: [
			{
				kind: 'toggle',
				name: 'Require frontmatter key',
				description: "Only show Influx on pages that have 'influx: true' in their frontmatter. When enabled, this setting overrides the pattern matching settings below.",
				setting: 'requireInfluxFrontmatterKey',
			},
			{
				kind: 'dropdown',
				name: 'Default behaviour',
				description: 'Configure Influx to either be shown on all pages by default - and then define specifically which pages it should be excluded from, or to not be shown on any pages by default - and then define specifically which pages it should be included in.',
				setting: 'showBehaviour',
				options: [
					{ value: 'OPT_OUT', label: 'Show on all pages' },
					{ value: 'OPT_IN', label: 'Show on no pages' },
				],
				parse: (value) => (value === 'OPT_OUT' || value === 'OPT_IN' ? value : undefined),
			},
			{
				kind: 'patternTextArea',
				name: 'Exclude pages',
				description: 'RegExp patterns for pathnames of notes where the Influx component should not be shown.',
				setting: 'exclusionPattern',
			},
			{
				kind: 'patternTextArea',
				name: 'Include pages',
				description: 'RegExp patterns for pathnames of notes where the Influx component should be shown.',
				setting: 'inclusionPattern',
			},
		],
	},
	{
		title: 'Source notes – from which notes should Influx gather mentions?',
		fields: [
			{
				kind: 'dropdown',
				name: 'Default behaviour',
				description: 'Control whether source notes are included by default or only when matching include patterns.',
				setting: 'sourceBehaviour',
				options: [
					{ value: 'OPT_OUT', label: 'Include all notes' },
					{ value: 'OPT_IN', label: 'Exclude all notes' },
				],
				parse: (value) => (value === 'OPT_OUT' || value === 'OPT_IN' ? value : undefined),
			},
			{
				kind: 'patternTextArea',
				name: 'Exclude notes',
				description: 'RegExp patterns for pathnames of notes that should not be shown in any Influx.',
				setting: 'sourceExclusionPattern',
			},
			{
				kind: 'patternTextArea',
				name: 'Include notes',
				description: 'RegExp patterns for pathnames of notes that should be shown in Influx in relevant pages.',
				setting: 'sourceInclusionPattern',
			},
		],
	},
	{
		title: 'On which pages should Influx be collapsed by default?',
		fields: [
			{
				kind: 'toggle',
				name: 'Collapse all by default',
				description: 'Automatically collapse all backlink entries when opening a note. When enabled, this overrides the regex pattern settings below.',
				setting: 'collapseAllByDefault',
			},
			{
				kind: 'patternTextArea',
				name: 'Collapsed in pages',
				description: 'RegExp patterns for pathnames of notes where the list of backlinked clippings in the Influx component should be collapsed by default.',
				setting: 'collapsedPattern',
			},
		],
	},
	{
		title: 'Front Matter Link Processing',
		fields: [
			{
				kind: 'toggle',
				name: 'Include links from front matter properties',
				description: 'Process Obsidian links found in front matter properties and include them in backlinks.',
				setting: 'includeFrontmatterLinks',
			},
			{
				kind: 'frontmatterProperties',
				name: 'Front matter properties',
				description: '',
			},
		],
	},
	{
		title: 'Advanced Diagnostics',
		detailsSummary: 'Diagnostics and bug-report tools (advanced)',
		detailsIntro: 'These options are intended for troubleshooting and issue reports, not normal usage.',
		fields: [
			{
				kind: 'debugToggle',
				name: 'Enable debug logging',
				description: 'Enables verbose debug logs in the developer console.',
			},
			{
				kind: 'toggle',
				name: 'Enable performance metrics',
				description: 'Captures minimal timing metrics and includes them in debug logs and window.influxDebug.getMetrics().',
				setting: 'metricsEnabled',
			},
		],
	},
];

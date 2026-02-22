// Timing constants for debounce and cleanup operations
const TIMING = {
	DEBOUNCE_DELAY_MS: 100,
	DEBOUNCE_DELAY_LONG_MS: 3000,
	DELAYED_CALLBACK_TIMEOUT_MS: 2000,
	CLEANUP_TIMEOUT_MS: 5000,
} as const;

const PERFORMANCE = {
	SUMMARY_BUILD_CONCURRENCY: 6,
	MARKDOWN_RENDER_CONCURRENCY: 4,
} as const;

// DOM element and class names for Influx plugin
const DOM = {
	INFLUX_ELEMENT_TAG: 'influx-plugin-widget-v2',
	INFLUX_ELEMENT_TAG_LEGACY: 'obsidian-influx-element',
	INFLUX_CONTAINER_TAG: 'influx-preview-container-v2',
	INFLUX_CONTAINER_TAG_LEGACY: 'influx-preview-container',
	INFLUX_WRAPPER_CLASS: 'influx-preview-wrapper',
	VIEW_TYPE_SIDEBAR: 'influx-sidebar-view',
	CENTERED_WIDTH_PX: 160,
} as const;

// Feature flags and configuration
const FEATURES = {
	FRONTMATTER_KEY: 'influx-title',
} as const;

export const CONSTANTS = {
	...TIMING,
	...PERFORMANCE,
	...DOM,
	...FEATURES,
} as const;

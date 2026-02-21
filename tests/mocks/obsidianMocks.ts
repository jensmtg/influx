/**
 * Shared mock for Obsidian App
 * Provides minimal Obsidian app functionality for testing
 */

export const mockApp = {
	vault: {
		getAbstractFileByPath: jest.fn(),
		read: jest.fn(),
	},
	workspace: {
		getActiveFile: jest.fn(),
		iterateRootLeaves: jest.fn(),
		on: jest.fn(),
	},
	metadataCache: {
		getFileCache: jest.fn(),
	},
} as any;

/**
 * Mock TFile object
 */
export const mockTFile = (path: string, basename: string) => ({
	path,
	basename,
	extension: path.split('.').pop(),
	name: basename,
	vault: {} as any,
	parent: {} as any,
	stat: {
		mtime: Date.now(),
		ctime: Date.now(),
		size: 0,
	},
}) as any;

/**
 * Mock CachedMetadata
 */
export const mockCachedMetadata = (overrides = {}) => ({
	frontmatter: null as unknown,
	links: [] as unknown[],
	embeds: [] as unknown[],
	tags: [] as unknown[],
	headings: [] as unknown[],
	...overrides,
});

/**
 * Mock LinkCache
 */
export const mockLinkCache = (overrides = {}) => ({
	link: '[[test]]',
	position: { start: { line: 0, col: 0 }, end: { line: 0, col: 0 } },
	original: '[[test]]',
	...overrides,
});

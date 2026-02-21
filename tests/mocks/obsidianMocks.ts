/**
 * Shared mock for Obsidian App
 * Provides minimal Obsidian app functionality for testing
 */

import { TFile } from 'obsidian';

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
};

/**
 * Mock TFile object - uses the mocked TFile from obsidian package
 */
export const mockTFile = (path: string, basename: string) => {
	const MockedTFile = TFile as unknown as new (mockPath: string, mockBasename: string) => TFile;
	return new MockedTFile(path, basename);
};

/**
 * Mock TFile class (for reference, but not used directly)
 */
export class MockTFile {
	constructor(
		public path: string,
		public basename: string
	) {
		this.path = path;
		this.basename = basename;
		this.extension = path.split('.').pop() || '';
		this.name = basename;
		this.vault = {};
		this.parent = {};
		this.stat = {
			mtime: Date.now(),
			ctime: Date.now(),
			size: 0,
		};
	}

	extension: string;
	name: string;
	vault: Record<string, unknown>;
	parent: Record<string, unknown>;
	stat: { mtime: number; ctime: number; size: number };
}

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

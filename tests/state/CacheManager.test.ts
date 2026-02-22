/**
 * Unit tests for InfluxCacheManager
 * Tests cache management system with TTL, invalidation, and thread safety
 */

import { InfluxCacheManager } from '../../src/state/CacheManager';
import { mockTFile } from '../mocks';

// Mock logger to suppress console output during tests
jest.mock('../../src/utils/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}
}));

describe('InfluxCacheManager', () => {
	let cacheManager: InfluxCacheManager;

	beforeEach(() => {
		cacheManager = InfluxCacheManager.getInstance();
		cacheManager.clearAll();
	});

	afterEach(() => {
		cacheManager.clearAll();
	});

	describe('File Cache', () => {
		test('should cache and retrieve files', () => {
			const file = mockTFile('test.md', 'test');
			
			cacheManager.setFile('test.md', file as any);
			const retrieved = cacheManager.getFile('test.md');
			
			expect(retrieved).toBe(file);
		});

		test('should retrieve files with normalized/case-insensitive paths', () => {
			const file = mockTFile('Folder/Test.md', 'test');

			cacheManager.setFile('Folder/Test.md', file as any);

			expect(cacheManager.getFile('folder\\test.md')).toBe(file);
		});

		test('should return null for non-existent files', () => {
			const retrieved = cacheManager.getFile('nonexistent.md');
			
			expect(retrieved).toBeNull();
		});

		test('should invalidate file cache', () => {
			const file = mockTFile('test.md', 'test');
			
			cacheManager.setFile('test.md', file as any);
			cacheManager.invalidateFile('test.md');
			
			const retrieved = cacheManager.getFile('test.md');
			expect(retrieved).toBeNull();
		});

		test('should expire stale file entries (5 minutes)', () => {
			const file = mockTFile('test.md', 'test');
			
			cacheManager.setFile('test.md', file as any);
			
			// Advance time by 6 minutes
			jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
			
			const retrieved = cacheManager.getFile('test.md');
			expect(retrieved).toBeNull();
		});
	});

	describe('Backlinks Cache', () => {
		test('should cache and retrieve backlinks', () => {
			const backlinks = { data: { 'test.md': [] as any } } as any;
			
			cacheManager.setBacklinks('test.md', backlinks);
			const retrieved = cacheManager.getBacklinks('test.md');
			
			expect(retrieved).toEqual(backlinks);
		});

		test('should return null for non-existent backlinks', () => {
			const retrieved = cacheManager.getBacklinks('nonexistent.md');
			
			expect(retrieved).toBeNull();
		});
	});

	describe('Settings Cache', () => {
		test('should cache and retrieve settings', () => {
			const settings = { showInfluxInSidebar: false, liveUpdate: false, sortingPrinciple: 'file-basename', sortingAttribute: 'alphabetical', showBehaviour: 'OPT_OUT' };
			
			cacheManager.setSettings(settings as any);
			const retrieved = cacheManager.getSettings();
			
			expect(retrieved).toEqual(settings);
		});
	});

	describe('Regex Cache', () => {
		test('should cache valid regex patterns', () => {
			const regex = /test/i;
			
			cacheManager.setRegex('test', regex);
			const retrieved = cacheManager.getRegex('test');
			
			expect(retrieved).toBe(regex);
		});

		test('should return null for invalid patterns', () => {
			cacheManager.setInvalidRegex('invalid');
			const retrieved = cacheManager.getRegex('invalid');
			
			expect(retrieved).toBeNull();
		});
	});

	describe('Summary Cache', () => {
		test('should cache and retrieve summaries by source/mtime/target/settings key', () => {
			cacheManager.setSummary('Source.md', 1000, 'Target.md', 'hash-a', {
				summary: 'summary content',
				title: 'My title',
				titleLineNum: 3,
				isLinkInTitle: true,
			});

			const cached = cacheManager.getSummary('Source.md', 1000, 'Target.md', 'hash-a');
			expect(cached).toEqual({
				summary: 'summary content',
				title: 'My title',
				titleLineNum: 3,
				isLinkInTitle: true,
			});
		});

		test('should normalize paths for summary cache lookup', () => {
			cacheManager.setSummary('Folder\\Source.md', 1000, 'Folder\\Target.md', 'hash-a', {
				summary: 'summary content',
				title: 'My title',
				titleLineNum: undefined,
				isLinkInTitle: false,
			});

			const cached = cacheManager.getSummary('folder/source.md', 1000, 'folder/target.md', 'hash-a');
			expect(cached).not.toBeNull();
		});

		test('should return null for stale summary entries', () => {
			cacheManager.setSummary('Source.md', 1000, 'Target.md', 'hash-a', {
				summary: 'summary content',
				title: 'My title',
				titleLineNum: 1,
				isLinkInTitle: false,
			});

			const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60 * 1000);
			expect(cacheManager.getSummary('Source.md', 1000, 'Target.md', 'hash-a')).toBeNull();
			nowSpy.mockRestore();
		});

		test('should invalidate summary entries when source file is invalidated', () => {
			cacheManager.setSummary('Source.md', 1000, 'Target-a.md', 'hash-a', {
				summary: 'a',
				title: 'title a',
				titleLineNum: 1,
				isLinkInTitle: false,
			});
			cacheManager.setSummary('Source.md', 1001, 'Target-b.md', 'hash-a', {
				summary: 'b',
				title: 'title b',
				titleLineNum: 2,
				isLinkInTitle: false,
			});

			cacheManager.invalidateFile('source.md');

			expect(cacheManager.getSummary('Source.md', 1000, 'Target-a.md', 'hash-a')).toBeNull();
			expect(cacheManager.getSummary('Source.md', 1001, 'Target-b.md', 'hash-a')).toBeNull();
		});

		test('should invalidate summary entries when target file is invalidated', () => {
			cacheManager.setSummary('Source-a.md', 1000, 'Target.md', 'hash-a', {
				summary: 'a',
				title: 'title a',
				titleLineNum: 1,
				isLinkInTitle: false,
			});
			cacheManager.setSummary('Source-b.md', 1000, 'Target.md', 'hash-a', {
				summary: 'b',
				title: 'title b',
				titleLineNum: 2,
				isLinkInTitle: true,
			});

			cacheManager.invalidateFile('target.md');

			expect(cacheManager.getSummary('Source-a.md', 1000, 'Target.md', 'hash-a')).toBeNull();
			expect(cacheManager.getSummary('Source-b.md', 1000, 'Target.md', 'hash-a')).toBeNull();
		});
	});

	describe('Cache Invalidation', () => {
		test('should clear all caches', () => {
			const file = mockTFile('test.md', 'test');
			cacheManager.setFile('test.md', file as any);
			cacheManager.clearAll();
			
			expect(cacheManager.getFile('test.md')).toBeNull();
		});

		test('should invalidate file and related caches', () => {
			const backlinks = { data: {} };
			cacheManager.setFile('test.md', mockTFile('test.md', 'test') as any);
			cacheManager.setBacklinks('test.md', backlinks);
			cacheManager.setSummary('source.md', 1000, 'test.md', 'hash-a', {
				summary: 'cached',
				title: 'title',
				titleLineNum: 1,
				isLinkInTitle: false,
			});
			cacheManager.invalidateFile('test.md');
			
			expect(cacheManager.getFile('test.md')).toBeNull();
			expect(cacheManager.getBacklinks('test.md')).toBeNull();
			expect(cacheManager.getSummary('source.md', 1000, 'test.md', 'hash-a')).toBeNull();
		});

		test('should invalidate dependent backlink caches when a source file changes', () => {
			cacheManager.setBacklinks('target-a.md', {
				data: new Map([
					['source.md', []],
					['other.md', []]
				])
			} as any);
			cacheManager.setBacklinks('target-b.md', {
				data: {
					'source.md': [],
					'another.md': []
				}
			} as any);
			cacheManager.setBacklinks('unrelated.md', {
				data: new Map([
					['different-source.md', []]
				])
			} as any);

			cacheManager.invalidateFile('source.md');

			expect(cacheManager.getBacklinks('target-a.md')).toBeNull();
			expect(cacheManager.getBacklinks('target-b.md')).toBeNull();
			expect(cacheManager.getBacklinks('unrelated.md')).not.toBeNull();
		});

		test('should invalidate dependent backlinks for normalized source paths', () => {
			cacheManager.setBacklinks('Target.md', {
				data: new Map([
					['Folder\\Source.md', []],
				])
			} as any);

			cacheManager.invalidateFile('folder/source.md');

			expect(cacheManager.getBacklinks('target.md')).toBeNull();
		});

		test('should clear summary cache when settings cache is invalidated', () => {
			cacheManager.setSummary('source.md', 1000, 'target.md', 'hash-a', {
				summary: 'cached',
				title: 'title',
				titleLineNum: 1,
				isLinkInTitle: false,
			});
			cacheManager.invalidateSettingsCache();
			expect(cacheManager.getSummary('source.md', 1000, 'target.md', 'hash-a')).toBeNull();
		});
	});

	describe('Debug Info', () => {
		test('should return debug information with cache sizes', () => {
			const file = mockTFile('test.md', 'test');
			const backlinks = { data: {} };
			
			cacheManager.setFile('test.md', file as any);
			cacheManager.setBacklinks('test.md', backlinks);
			
			const debugInfo = cacheManager.getDebugInfo();
			
			expect(debugInfo).toHaveProperty('fileCache');
			expect(debugInfo).toHaveProperty('backlinksCache');
			expect(debugInfo).toHaveProperty('settingsCache');
			expect(debugInfo).toHaveProperty('regexCache');
		});
	});
});

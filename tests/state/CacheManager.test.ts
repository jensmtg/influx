/**
 * Unit tests for InfluxCacheManager
 * Tests the cache management system with TTL, invalidation, and thread safety
 */

import { InfluxCacheManager, CacheDebugInfo } from '../../src/state/CacheManager';
import { mockTFile, mockCachedMetadata, mockLinkCache } from '../mocks';

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
			cacheManager.setRegex('invalid', null as any);
			const retrieved = cacheManager.getRegex('invalid');
			
			expect(retrieved).toBeNull();
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
			cacheManager.invalidateFile('test.md');
			
			expect(cacheManager.getFile('test.md')).toBeNull();
			expect(cacheManager.getBacklinks('test.md')).toBeNull();
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

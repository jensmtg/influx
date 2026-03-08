import { ApiAdapterPolicy } from '@/domain/backlinks/api-adapter-policy';
import { DEFAULT_SETTINGS } from '@/types';
import { cacheManager } from '@/platform/cache/cache-manager';
import { mockTFile } from '../../mocks';

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

describe('ApiAdapterPolicy', () => {
	beforeEach(() => {
		cacheManager.clearAll();
	});

	test('merges plugin settings with defaults and caches regex patterns', () => {
		const policy = new ApiAdapterPolicy({
			data: {
				settings: {
					includeFrontmatterLinks: true,
					inclusionPattern: ['^Projects/'],
				},
			},
		});

		const settings = policy.getSettings();

		expect(settings.liveUpdate).toBe(DEFAULT_SETTINGS.liveUpdate);
		expect(settings.includeFrontmatterLinks).toBe(true);
		expect(cacheManager.getRegex('^Projects/')).toBeInstanceOf(RegExp);
	});

		test('caches invalid regexes as non-matching sentinels', () => {
		const policy = new ApiAdapterPolicy({
			data: {
				settings: {
					...DEFAULT_SETTINGS,
					collapsedPattern: ['[broken'],
				},
			},
		});

			expect(policy.getCollapsedStatus(mockTFile('Broken.md', 'Broken'))).toBe(false);
			expect(cacheManager.getRegex('[broken')).toBeNull();
		});

	test('prefers collapse-all over pattern matching', () => {
		const policy = new ApiAdapterPolicy({
			data: {
				settings: {
					...DEFAULT_SETTINGS,
					collapseAllByDefault: true,
					collapsedPattern: [],
				},
			},
		});

		expect(policy.getCollapsedStatus(mockTFile('Any.md', 'Any'))).toBe(true);
	});
});

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

	test('merges partial plugin settings with defaults', () => {
		const policy = new ApiAdapterPolicy({
			data: {
				settings: {
					includeFrontmatterLinks: true,
					listLimit: 12,
				},
			},
		});

		const settings = policy.getSettings();

		expect(settings.includeFrontmatterLinks).toBe(true);
		expect(settings.listLimit).toBe(12);
		expect(settings.liveUpdate).toBe(DEFAULT_SETTINGS.liveUpdate);
		expect(settings.showBehaviour).toBe(DEFAULT_SETTINGS.showBehaviour);
	});

	test('getShowStatus honors the required influx frontmatter key before pattern matching', () => {
		const policy = new ApiAdapterPolicy({
			data: {
				settings: {
					...DEFAULT_SETTINGS,
					requireInfluxFrontmatterKey: true,
					showBehaviour: 'OPT_OUT',
					exclusionPattern: [],
				},
			},
		});

		expect(
			policy.getShowStatus(mockTFile('Hidden.md', 'Hidden'), {
				frontmatter: { influx: true },
			} as any)
		).toBe(true);
		expect(
			policy.getShowStatus(mockTFile('Hidden.md', 'Hidden'), {
				frontmatter: { influx: false },
			} as any)
		).toBe(false);
		expect(policy.getShowStatus(mockTFile('Hidden.md', 'Hidden'), null)).toBe(false);
	});

	test('isIncludableSource ignores invalid regexes and still respects valid source patterns', () => {
		const policy = new ApiAdapterPolicy({
			data: {
				settings: {
					...DEFAULT_SETTINGS,
					sourceBehaviour: 'OPT_IN',
					sourceInclusionPattern: ['[broken', '^Projects/'],
					sourceExclusionPattern: [],
				},
			},
		});

		expect(policy.isIncludableSource('Projects/Note.md')).toBe(true);
		expect(policy.isIncludableSource('Archive/Note.md')).toBe(false);
	});

	test('getCollapsedStatus prefers collapse-all over pattern matching', () => {
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

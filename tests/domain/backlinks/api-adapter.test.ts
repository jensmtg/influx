import { CachedMetadata, FrontmatterLinkCache, LinkCache } from 'obsidian';
import { ApiAdapter } from '@/domain/backlinks/api-adapter';
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

describe('ApiAdapter', () => {
	const createContext = (settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {}) => {
		const file = mockTFile('Target.md', 'Target');
		const source = mockTFile('Source.md', 'Source');

		const metadataByPath = new Map<string, CachedMetadata>([
			[
				'Source.md',
				{
					frontmatterLinks: [{ key: 'related', link: 'Target' } as FrontmatterLinkCache],
				} as CachedMetadata,
			],
			[
				'Target.md',
				{
					frontmatterLinks: [{ key: 'related', link: 'Reference Note' } as FrontmatterLinkCache],
				} as CachedMetadata,
			],
		]);

		const app = {
			vault: {
				getAbstractFileByPath: jest.fn((path: string) => {
					if (path === 'Target.md') return file;
					if (path === 'Source.md') return source;
					return null;
				}),
				read: jest.fn().mockResolvedValue('content'),
			},
			metadataCache: {
				getFileCache: jest.fn((requestedFile: { path: string }) => metadataByPath.get(requestedFile.path) ?? null),
				getBacklinksForFile: jest.fn(() => ({
					data: new Map<string, LinkCache[]>([
						[
							'Source.md',
							[
								{
									link: 'Target',
									position: {
										start: { line: 0, col: 0, offset: 0 },
										end: { line: 0, col: 10, offset: 10 },
									},
								} as LinkCache,
							],
						],
					]),
				})),
			},
		};

		const plugin = {
			data: {
				settings: {
					...DEFAULT_SETTINGS,
					...settingsOverrides,
				},
			},
		};

		return {
			app,
			file,
			plugin,
			api: new ApiAdapter(app as any, plugin),
		};
	};

	beforeEach(() => {
		cacheManager.clearAll();
	});

	test('returns empty backlinks when metadata cache lacks getBacklinksForFile', () => {
		const { app, api, file } = createContext();
		delete (app.metadataCache as { getBacklinksForFile?: unknown }).getBacklinksForFile;

		const backlinks = api.getBacklinks(file);

		expect(backlinks.data).toBeInstanceOf(Map);
		expect((backlinks.data as Map<string, LinkCache[]>).size).toBe(0);
	});

	test('filters out source frontmatter links when frontmatter inclusion is disabled', () => {
		const { api, file } = createContext({ includeFrontmatterLinks: false });

		const backlinks = api.getBacklinks(file);

		expect((backlinks.data as Map<string, LinkCache[]>).has('Source.md')).toBe(false);
	});

	test('does not treat target note frontmatter links as backlinks when frontmatter inclusion is enabled', () => {
		const { api, file } = createContext({
			includeFrontmatterLinks: true,
			frontmatterProperties: ['related'],
		});

		const backlinks = api.getBacklinks(file);

		expect((backlinks.data as Map<string, LinkCache[]>).has('Source.md')).toBe(true);
		expect((backlinks.data as Map<string, LinkCache[]>).has('Reference Note')).toBe(false);
	});

	test('filters inbound frontmatter backlinks by configured frontmatter properties', () => {
		const { api, file, app } = createContext({
			includeFrontmatterLinks: true,
			frontmatterProperties: ['citations'],
		});

		(app.metadataCache.getBacklinksForFile as jest.Mock).mockReturnValue({
			data: new Map<string, LinkCache[]>([
				[
					'Source.md',
					[
						{
							link: 'Target',
							position: {
								start: { line: 0, col: 0, offset: 0 },
								end: { line: 0, col: 10, offset: 10 },
							},
						} as LinkCache,
					],
				],
			]),
		});

		const backlinks = api.getBacklinks(file);

		expect((backlinks.data as Map<string, LinkCache[]>).has('Source.md')).toBe(false);
	});

	test('honors requireInfluxFrontmatterKey when evaluating show status', () => {
		const { api, file, app, plugin } = createContext({
			requireInfluxFrontmatterKey: true,
		});

		(app.metadataCache.getFileCache as jest.Mock).mockReturnValueOnce({
			frontmatter: { influx: true },
		} as CachedMetadata);
		expect(api.getShowStatus(file)).toBe(true);

		(app.metadataCache.getFileCache as jest.Mock).mockReturnValueOnce({
			frontmatter: { influx: false },
		} as CachedMetadata);
		api.invalidateSettingsCache();
		plugin.data.settings = {
			...plugin.data.settings,
			requireInfluxFrontmatterKey: true,
		};
		expect(api.getShowStatus(file)).toBe(false);
	});

	test('invalidating a file cache clears cached backlinks for that file', () => {
		const { api, file, app } = createContext();

		api.getBacklinks(file);
		expect(app.metadataCache.getBacklinksForFile).toHaveBeenCalledTimes(1);

		api.getBacklinks(file);
		expect(app.metadataCache.getBacklinksForFile).toHaveBeenCalledTimes(1);

		api.invalidateFileCache(file.path);
		api.getBacklinks(file);
		expect(app.metadataCache.getBacklinksForFile).toHaveBeenCalledTimes(2);
	});
});

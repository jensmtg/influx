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
	const createFrontmatterLink = (key: string, link: string): FrontmatterLinkCache => ({
		key,
		link,
		displayText: link,
		original: `[[${link}]]`,
	}) as FrontmatterLinkCache;

	const createMetadata = (links: FrontmatterLinkCache[], frontmatter?: Record<string, unknown>): CachedMetadata => ({
		frontmatterLinks: links,
		frontmatter,
	}) as CachedMetadata;

	const createBacklink = (link: string, line = 0): LinkCache => ({
		link,
		position: {
			start: { line, col: 0, offset: 0 },
			end: { line, col: 10, offset: 10 },
		},
	}) as LinkCache;

	const createContext = (settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {}) => {
		const file = mockTFile('Target.md', 'Target');
		const source = mockTFile('Source.md', 'Source');

		const metadataByPath = new Map<string, CachedMetadata>([
			[
				'Source.md',
				createMetadata([createFrontmatterLink('related', 'Target')]),
			],
			[
				'Target.md',
				createMetadata([createFrontmatterLink('related', 'Reference Note')]),
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
				resolvedLinks: {
					'Source.md': { 'Target.md': 1 },
				},
				getFileCache: jest.fn((requestedFile: { path: string }) => metadataByPath.get(requestedFile.path) ?? null),
				getBacklinksForFile: jest.fn(() => ({
					data: new Map<string, LinkCache[]>([
						[
							'Source.md',
							[createBacklink('Target')],
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
		delete (app.metadataCache as { resolvedLinks?: unknown }).resolvedLinks;

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
						[createBacklink('Target')],
					],
				]),
			});

		const backlinks = api.getBacklinks(file);

		expect((backlinks.data as Map<string, LinkCache[]>).has('Source.md')).toBe(false);
	});

		test('clones metadata-cache backlinks before filtering so the original object stays untouched', () => {
			const { api, file, app } = createContext({ includeFrontmatterLinks: false });
			const originalBacklinks = {
				data: new Map<string, LinkCache[]>([
					[
						'Source.md',
						[createBacklink('Target')],
					],
				]),
			};
		(app.metadataCache.getBacklinksForFile as jest.Mock).mockReturnValue(originalBacklinks);

		const backlinks = api.getBacklinks(file);

		expect((backlinks.data as Map<string, LinkCache[]>).has('Source.md')).toBe(false);
		expect((originalBacklinks.data as Map<string, LinkCache[]>).has('Source.md')).toBe(true);
		expect(backlinks.data).not.toBe(originalBacklinks.data);
	});

		test('honors requireInfluxFrontmatterKey when evaluating show status', () => {
			const { api, file, app, plugin } = createContext({
				requireInfluxFrontmatterKey: true,
			});

			(app.metadataCache.getFileCache as jest.Mock).mockReturnValueOnce(createMetadata([], { influx: true }));
			expect(api.getShowStatus(file)).toBe(true);

			(app.metadataCache.getFileCache as jest.Mock).mockReturnValueOnce(createMetadata([], { influx: false }));
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

	test('getBacklinksFresh bypasses cached target backlinks and does not overwrite the cache', () => {
		const { api, file, app } = createContext({ includeFrontmatterLinks: true, frontmatterProperties: ['related'] });

		(app.metadataCache.getBacklinksForFile as jest.Mock)
			.mockReturnValueOnce({ data: new Map([['Source.md', [createBacklink('Target')]]]) })
			.mockReturnValueOnce({ data: new Map([['Fresh.md', [createBacklink('Target')]]]) });
		(app.metadataCache as any).resolvedLinks = {
			'Source.md': { 'Target.md': 1 },
		};

		const cached = api.getBacklinks(file);
		(app.metadataCache as any).resolvedLinks = {
			'Fresh.md': { 'Target.md': 1 },
		};
		const fresh = api.getBacklinksFresh(file);
		const cachedAgain = api.getBacklinks(file);

		expect((cached.data as Map<string, LinkCache[]>).has('Source.md')).toBe(true);
		expect((fresh.data as Map<string, LinkCache[]>).has('Fresh.md')).toBe(true);
		expect((cachedAgain.data as Map<string, LinkCache[]>).has('Source.md')).toBe(true);
		expect(app.metadataCache.getBacklinksForFile).toHaveBeenCalledTimes(2);
	});

	test('reconciles stale getBacklinksForFile output against resolvedLinks for existing targets', () => {
		const { api, file, app } = createContext({ includeFrontmatterLinks: true, frontmatterProperties: ['related'] });
		(app.metadataCache.getBacklinksForFile as jest.Mock).mockReturnValue({
			data: new Map<string, LinkCache[]>([
				['Stale.md', [createBacklink('Target')]],
			]),
		});
		(app.metadataCache as any).resolvedLinks = {
			'Source.md': { 'Target.md': 1 },
		};

		const backlinks = api.getBacklinks(file);

		expect((backlinks.data as Map<string, LinkCache[]>).has('Stale.md')).toBe(false);
		expect((backlinks.data as Map<string, LinkCache[]>).has('Source.md')).toBe(true);
	});
});

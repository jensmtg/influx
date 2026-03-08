import { InlinkingFile } from '@/domain/backlinks/inlinking-file';
import { cacheManager } from '@/platform/cache/cache-manager';
import { mockTFile } from '../../mocks';

jest.mock('@/platform/diagnostics/logger', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	}
}));

describe('InlinkingFile', () => {
	beforeEach(() => {
		cacheManager.clearAll();
		InlinkingFile.clearSummaryCachesForTests();
	});

	afterEach(() => {
		cacheManager.clearAll();
		InlinkingFile.clearSummaryCachesForTests();
	});

	test('should dedupe concurrent summary builds for same source/target/settings', async () => {
		const sourceFile = mockTFile('Source.md', 'Source');
		sourceFile.stat.mtime = 1234;

		const mockApi = {
			getMetadata: jest.fn().mockReturnValue({
				links: [
					{ position: { start: { line: 1 } }, link: 'Target' },
				],
				headings: [
					{ heading: 'Source', position: { start: { line: 0 } } },
				],
				frontmatter: null,
			}),
			readFile: jest.fn().mockImplementation(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return '# Source\n[[Target]]\nBody';
			}),
			compareLinkName: jest.fn().mockReturnValue(true),
		};

		const contextFile = {
			file: {
				path: 'Target.md',
				basename: 'Target',
			},
		} as any;

		const fileA = new InlinkingFile(sourceFile as any, mockApi as any);
		const fileB = new InlinkingFile(sourceFile as any, mockApi as any);

		await Promise.all([
			fileA.makeSummary(contextFile, 'settings-hash'),
			fileB.makeSummary(contextFile, 'settings-hash'),
		]);

		expect(mockApi.readFile).toHaveBeenCalledTimes(1);
		expect(fileA.summary).toBe(fileB.summary);

		const fileC = new InlinkingFile(sourceFile as any, mockApi as any);
		await fileC.makeSummary(contextFile, 'settings-hash');
		expect(mockApi.readFile).toHaveBeenCalledTimes(1);
	});
});

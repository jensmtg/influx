import { InlinkingFile, type InlinkingFileApi } from '@/domain/backlinks/inlinking-file';
import { cacheManager } from '@/platform/cache/cache-manager';
import type InfluxFile from '@/domain/backlinks/influx-file';
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

		const mockApi: InlinkingFileApi = {
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

		const contextFile: Pick<InfluxFile, 'file'> = {
			file: {
				path: 'Target.md',
				basename: 'Target',
			},
		};

		const fileA = new InlinkingFile(sourceFile, mockApi);
		const fileB = new InlinkingFile(sourceFile, mockApi);

		await Promise.all([
			fileA.makeSummary(contextFile, 'settings-hash'),
			fileB.makeSummary(contextFile, 'settings-hash'),
		]);

		expect(mockApi.readFile).toHaveBeenCalledTimes(1);
		expect(fileA.summary).toBe(fileB.summary);

		const fileC = new InlinkingFile(sourceFile, mockApi);
		await fileC.makeSummary(contextFile, 'settings-hash');
		expect(mockApi.readFile).toHaveBeenCalledTimes(1);
	});
});

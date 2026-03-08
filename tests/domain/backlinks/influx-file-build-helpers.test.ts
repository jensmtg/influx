import { collectValidBacklinkFiles, sortInfluxSourceFiles } from '@/domain/backlinks/influx-file-build-helpers';
import { mockTFile } from '../../mocks';

describe('influx-file-build-helpers', () => {
	test('collectValidBacklinkFiles filters self links, excluded paths, and missing files', () => {
		const target = mockTFile('Target.md', 'Target');
		const sourceA = mockTFile('Folder/SourceA.md', 'SourceA');
		const sourceB = mockTFile('Folder/SourceB.md', 'SourceB');
		const api = {
			isIncludableSource: jest.fn((path: string) => path !== 'Ignored.md'),
			getFileByPath: jest.fn((path: string) => {
				if (path === target.path) return target;
				if (path === sourceA.path) return sourceA;
				if (path === sourceB.path) return sourceB;
				return null;
			}),
		};

		const files = collectValidBacklinkFiles({
			backlinks: {
				data: new Map([
					['Target.md', []],
					['Folder/SourceA.md', []],
					['Ignored.md', []],
					['Folder/SourceB.md', []],
					['Missing.md', []],
				]),
			} as any,
			currentFilePath: target.path,
			api: api as any,
		});

		expect(files).toEqual([sourceA, sourceB]);
		expect(api.isIncludableSource).toHaveBeenCalledWith('Ignored.md');
	});

	test('collectValidBacklinkFiles supports object-shaped backlinks data', () => {
		const source = mockTFile('Folder/Source.md', 'Source');
		const api = {
			isIncludableSource: jest.fn().mockReturnValue(true),
			getFileByPath: jest.fn((path: string) => (path === source.path ? source : null)),
		};

		const files = collectValidBacklinkFiles({
			backlinks: {
				data: {
					'Folder/Source.md': [],
				},
			} as any,
			currentFilePath: 'Target.md',
			api: api as any,
		});

		expect(files).toEqual([source]);
	});

	test('collectValidBacklinkFiles normalizes backlink source paths before lookup and filtering', () => {
		const source = mockTFile('Folder/Source.md', 'Source');
		const api = {
			isIncludableSource: jest.fn((path: string) => path === 'Folder/Source.md'),
			getFileByPath: jest.fn((path: string) => (path === 'Folder/Source.md' ? source : null)),
		};

		const files = collectValidBacklinkFiles({
			backlinks: {
				data: new Map([
					['Folder\\Source.md', []],
				]),
			} as any,
			currentFilePath: 'Target.md',
			api,
		});

		expect(files).toEqual([source]);
		expect(api.isIncludableSource).toHaveBeenCalledWith('Folder/Source.md');
		expect(api.getFileByPath).toHaveBeenCalledWith('Folder/Source.md');
	});

	test('collectValidBacklinkFiles dedupes normalized duplicate backlink source paths', () => {
		const source = mockTFile('Folder/Source.md', 'Source');
		const api = {
			isIncludableSource: jest.fn().mockReturnValue(true),
			getFileByPath: jest.fn((path: string) => (path === 'Folder/Source.md' ? source : null)),
		};

		const files = collectValidBacklinkFiles({
			backlinks: {
				data: new Map([
					['Folder/Source.md', []],
					['Folder\\Source.md', []],
				]),
			} as any,
			currentFilePath: 'Target.md',
			api,
		});

		expect(files).toEqual([source]);
		expect(api.getFileByPath).toHaveBeenCalledTimes(1);
	});

	test('sortInfluxSourceFiles sorts by filename according to configured direction', () => {
		const bravo = mockTFile('Bravo.md', 'Bravo');
		const alpha = mockTFile('Alpha.md', 'Alpha');

		const sorted = sortInfluxSourceFiles([bravo, alpha], {
			sortingAttribute: 'FILENAME',
			sortingPrinciple: 'OLDEST_FIRST',
		} as any);

		expect(sorted).toEqual([alpha, bravo]);
	});

	test('sortInfluxSourceFiles sorts by time for newest first', () => {
		const older = mockTFile('Older.md', 'Older');
		const newer = mockTFile('Newer.md', 'Newer');
		older.stat.mtime = 10;
		newer.stat.mtime = 20;

		const sorted = sortInfluxSourceFiles([older, newer], {
			sortingAttribute: 'mtime',
			sortingPrinciple: 'NEWEST_FIRST',
		} as any);

		expect(sorted).toEqual([newer, older]);
	});
});

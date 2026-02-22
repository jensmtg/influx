import { ApiAdapter } from '../src/apiAdapter';
import { DEFAULT_SETTINGS } from '../src/types';

describe('ApiAdapter.renderAllMarkdownBlocks', () => {
	function createAdapter(listLimit = 0): ApiAdapter {
		const app = {
			vault: {},
			metadataCache: {},
		} as any;
		const plugin = {
			data: {
				settings: { ...DEFAULT_SETTINGS, listLimit },
			},
		} as any;
		const adapter = new ApiAdapter(app, plugin);
		jest.spyOn(adapter, 'getSettings').mockReturnValue({ ...DEFAULT_SETTINGS, listLimit });
		return adapter;
	}

	it('returns markdown-oriented entries with source path', async () => {
		const adapter = createAdapter();
		const inlinkingFiles = [
			{
				file: { path: 'Notes/Alpha.md', basename: 'Alpha' },
				title: 'My Title',
				summary: '> [!info] Callout body',
			},
		] as any;

		const result = await adapter.renderAllMarkdownBlocks(inlinkingFiles, 'Target.md');

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			titleText: 'My Title',
			summaryMarkdown: '> [!info] Callout body',
			sourcePath: 'Notes/Alpha.md',
		});
	});

	it('applies list limit and falls back to target path when source path is missing', async () => {
		const adapter = createAdapter(1);
		const inlinkingFiles = [
			{
				file: { basename: 'Untitled' },
				title: 'Header',
				summary: '- item',
			},
			{
				file: { path: 'Notes/Beta.md', basename: 'Beta' },
				title: 'Second',
				summary: 'Body',
			},
		] as any;

		const result = await adapter.renderAllMarkdownBlocks(inlinkingFiles, 'Target.md');

		expect(result).toHaveLength(1);
		expect(result[0].sourcePath).toBe('Target.md');
		expect(result[0].titleText).toBe('Header');
	});
});

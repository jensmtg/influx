import { prepareMarkdownForInflux } from '@/ui/markdown-mount';

describe('prepareMarkdownForInflux', () => {
	test('should keep markdown unchanged when no query fence is present', () => {
		const markdown = '- item\n\nRegular paragraph';
		expect(prepareMarkdownForInflux(markdown)).toBe(markdown);
	});

	test('should neutralize query fences in backlink snippets', () => {
		const markdown = [
			'Before',
			'```query',
			'tag:#work',
			'path:"Projects"',
			'```',
			'After',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toContain('```text');
		expect(prepared).toContain('[Influx] query block disabled in backlink snippet');
		expect(prepared).toContain('tag:#work');
		expect(prepared).not.toContain('```query');
	});

	test('should neutralize query fences inside quoted blocks', () => {
		const markdown = [
			'> [!info]',
			'> ```query',
			'> tag:#work',
			'> ```',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toContain('> ```text');
		expect(prepared).toContain('[Influx] query block disabled in backlink snippet');
		expect(prepared).not.toContain('> ```query');
	});
});

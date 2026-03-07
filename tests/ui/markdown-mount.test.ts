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

	test('should neutralize dataview fences in backlink snippets', () => {
		const markdown = [
			'Before',
			'```dataview',
			'LIST FROM #project',
			'```',
			'After',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toContain('```text');
		expect(prepared).toContain('[Influx] dataview block disabled in backlink snippet');
		expect(prepared).toContain('LIST FROM #project');
		expect(prepared).not.toContain('```dataview');
	});

	test('should neutralize dataviewjs fences in quoted snippets', () => {
		const markdown = [
			'> ```dataviewjs',
			'> dv.list(["A", "B"])',
			'> ```',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toContain('> ```text');
		expect(prepared).toContain('[Influx] dataviewjs block disabled in backlink snippet');
		expect(prepared).not.toContain('> ```dataviewjs');
	});

	test('should keep normal code fences unchanged', () => {
		const markdown = [
			'```ts',
			'const value = 1;',
			'```',
		].join('\n');

		expect(prepareMarkdownForInflux(markdown)).toBe(markdown);
	});
});

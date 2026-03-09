/** @jest-environment jsdom */

import * as React from 'react';
import { act, render } from '@testing-library/react';
import { MarkdownRenderer } from 'obsidian';
import MarkdownMount, { prepareMarkdownForInflux } from '@/ui/markdown-mount';

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

describe('MarkdownMount lifecycle', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('keeps the latest render output when an older markdown render resolves late', async () => {
		let releaseFirstRender: (() => void) | undefined;
		jest.spyOn(MarkdownRenderer, 'renderMarkdown').mockImplementation(async (markdown: string, el: HTMLElement) => {
			if (markdown === 'First') {
				await new Promise<void>((resolve) => {
					releaseFirstRender = () => {
						el.textContent = markdown;
						resolve();
					};
				});
				return;
			}

			el.textContent = markdown;
		});

		const view = render(React.createElement(MarkdownMount, { markdown: 'First', sourcePath: 'First.md' }));

		await act(async () => {
			view.rerender(React.createElement(MarkdownMount, { markdown: 'Second', sourcePath: 'Second.md' }));
		});

		expect(view.container.textContent).toBe('Second');
		expect(releaseFirstRender).toBeTruthy();

		await act(async () => {
			releaseFirstRender?.();
		});

		expect(view.container.textContent).toBe('Second');
	});
});

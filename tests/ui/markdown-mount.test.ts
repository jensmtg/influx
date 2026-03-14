/** @jest-environment jsdom */

import * as React from 'react';
import { act, render } from '@testing-library/react';
import { MarkdownRenderer } from 'obsidian';
import MarkdownMount, { INFLUX_MARKDOWN_MOUNT_SELECTOR, prepareMarkdownForInflux } from '@/ui/markdown-mount';

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

	test('should neutralize tasks fences in backlink snippets', () => {
		const markdown = [
			'```tasks',
			'tags include #work',
			'```',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toContain('```text');
		expect(prepared).toContain('[Influx] tasks block disabled in backlink snippet');
		expect(prepared).not.toContain('```tasks');
	});

	test('should neutralize tilde fences in backlink snippets', () => {
		const markdown = [
			'~~~dataview',
			'LIST FROM #project',
			'~~~',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toContain('~~~text');
		expect(prepared).toContain('[Influx] dataview block disabled in backlink snippet');
		expect(prepared).not.toContain('~~~dataview');
	});

	test('should preserve the opening fence style when closing a truncated tilde snippet', () => {
		const markdown = [
			'> ~~~tasks',
			'> tags include #work',
		].join('\n');

		expect(prepareMarkdownForInflux(markdown)).toBe([
			'> ~~~text',
			'> [Influx] tasks block disabled in backlink snippet',
			'> tags include #work',
			'> ~~~',
		].join('\n'));
	});

	test('should close a sanitized fence when the snippet ends before the original block closes', () => {
		const markdown = [
			'Before',
			'```query',
			'tag:#work',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toBe([
			'Before',
			'```text',
			'[Influx] query block disabled in backlink snippet',
			'tag:#work',
			'```',
		].join('\n'));
	});

	test('should close a quoted sanitized fence when the snippet truncates inside the block', () => {
		const markdown = [
			'> [!info]',
			'> ```dataview',
			'> LIST FROM #project',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toBe([
			'> [!info]',
			'> ```text',
			'> [Influx] dataview block disabled in backlink snippet',
			'> LIST FROM #project',
			'> ```',
		].join('\n'));
	});

	test('should not close a sanitized fence on nested fenced content lines', () => {
		const markdown = [
			'```query',
			'```ts',
			'const value = 1;',
			'```',
			'```',
		].join('\n');

		const prepared = prepareMarkdownForInflux(markdown);
		expect(prepared).toBe([
			'```text',
			'[Influx] query block disabled in backlink snippet',
			'```ts',
			'const value = 1;',
			'```',
			'```',
		].join('\n'));
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
		jest.spyOn(MarkdownRenderer, 'render').mockImplementation(async (_app: unknown, markdown: string, el: HTMLElement) => {
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

		const view = render(React.createElement(MarkdownMount, { app: {}, markdown: 'First', sourcePath: 'First.md' }));

		await act(async () => {
			view.rerender(React.createElement(MarkdownMount, { app: {}, markdown: 'Second', sourcePath: 'Second.md' }));
		});

		expect(view.container.textContent).toBe('Second');
		expect(releaseFirstRender).toBeTruthy();

		await act(async () => {
			releaseFirstRender?.();
		});

		expect(view.container.textContent).toBe('Second');
	});

	test('marks the nested markdown render root so preview post-processors can ignore it', () => {
		jest.spyOn(MarkdownRenderer, 'render').mockResolvedValue(undefined as never);

		const view = render(React.createElement(MarkdownMount, { app: {}, markdown: 'Text', sourcePath: 'Note.md' }));
		const nestedRoot = view.container.querySelector(INFLUX_MARKDOWN_MOUNT_SELECTOR);

		expect(nestedRoot).toBeTruthy();
	});
});

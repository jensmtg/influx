/** @jest-environment jsdom */

import { attachInfluxLinkInteractions } from '../../../src/platform/obsidian/link-interactions';
import type { InfluxUiPlugin } from '../../../src/ui/influx-ui-plugin';
import { DEFAULT_SETTINGS } from '../../../src/types';

function makePlugin(): InfluxUiPlugin {
	return {
		data: { settings: DEFAULT_SETTINGS },
		cycleListLimit: jest.fn(async () => undefined),
		toggleFrontmatterLinks: jest.fn(async () => undefined),
		toggleSortOrder: jest.fn(async () => undefined),
		app: {
			workspace: {
				openLinkText: jest.fn(),
				trigger: jest.fn(),
			},
		},
	};
}

function dispatchMouseEvent(target: Element, type: string, init?: MouseEventInit): MouseEvent {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event;
}

describe('attachInfluxLinkInteractions', () => {
	test('opens preview links through workspace.openLinkText using the source note path context', () => {
		const plugin = makePlugin();
		const container = document.createElement('div');
		container.innerHTML = [
			'<div data-influx-source-path="Sources/Origin.md">',
			'	<a class="internal-link" data-href="Linked/Target.md" href="Linked/Target.md">Target</a>',
			'</div>',
		].join('');

		const cleanup = attachInfluxLinkInteractions({
			container,
			plugin,
			renderMode: 'preview',
			fallbackSourcePath: 'Fallback.md',
		});

		const link = container.querySelector('a.internal-link');
		expect(link).toBeTruthy();
		const event = dispatchMouseEvent(link as Element, 'click');

		expect(event.defaultPrevented).toBe(true);
		expect(plugin.app?.workspace?.openLinkText).toHaveBeenCalledWith('Linked/Target.md', 'Sources/Origin.md', false);

		cleanup();
	});

	test('opens sidebar links in a new leaf on modifier click', () => {
		const plugin = makePlugin();
		const container = document.createElement('div');
		container.innerHTML = '<a class="internal-link" href="Linked/Target.md">Target</a>';

		attachInfluxLinkInteractions({
			container,
			plugin,
			renderMode: 'sidebar',
			fallbackSourcePath: 'Sidebar/Current.md',
		});

		const link = container.querySelector('a.internal-link');
		expect(link).toBeTruthy();
		dispatchMouseEvent(link as Element, 'click', { ctrlKey: true });

		expect(plugin.app?.workspace?.openLinkText).toHaveBeenCalledWith('Linked/Target.md', 'Sidebar/Current.md', true);
	});

	test('triggers hover-link for rendered markdown links', () => {
		const plugin = makePlugin();
		const container = document.createElement('div');
		container.innerHTML = [
			'<div data-influx-source-path="Sources/Excerpt.md">',
			'	<div class="markdown-preview-view">',
			'		<a class="internal-link" data-href="Linked/ExcerptTarget.md">Excerpt target</a>',
			'</div>',
			'</div>',
		].join('');

		attachInfluxLinkInteractions({
			container,
			plugin,
			renderMode: 'preview',
			fallbackSourcePath: 'Fallback.md',
		});

		const link = container.querySelector('a.internal-link');
		expect(link).toBeTruthy();
		dispatchMouseEvent(link as Element, 'mouseover');

		expect(plugin.app?.workspace?.trigger).toHaveBeenCalledTimes(1);
		expect(plugin.app?.workspace?.trigger).toHaveBeenCalledWith(
			'hover-link',
			expect.objectContaining({
				linktext: 'Linked/ExcerptTarget.md',
				sourcePath: 'Sources/Excerpt.md',
				targetEl: link,
				source: 'influx-preview',
				state: expect.objectContaining({
					mode: 'preview',
					sourcePath: 'Sources/Excerpt.md',
				}),
			})
		);
	});

	test('does nothing in editor mode', () => {
		const plugin = makePlugin();
		const container = document.createElement('div');
		container.innerHTML = '<a class="internal-link" data-href="Linked/Target.md">Target</a>';

		attachInfluxLinkInteractions({
			container,
			plugin,
			renderMode: 'editor',
			fallbackSourcePath: 'Editor.md',
		});

		const link = container.querySelector('a.internal-link');
		expect(link).toBeTruthy();
		dispatchMouseEvent(link as Element, 'click');
		dispatchMouseEvent(link as Element, 'mouseover');

		expect(plugin.app?.workspace?.openLinkText).not.toHaveBeenCalled();
		expect(plugin.app?.workspace?.trigger).not.toHaveBeenCalled();
	});
});

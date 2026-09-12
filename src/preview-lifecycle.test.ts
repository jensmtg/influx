/** @jest-environment jsdom */

jest.mock('obsidian', () => ({
    Plugin: class {}, TFile: class {}, TAbstractFile: class {},
    Keymap: { isModEvent: () => false }, Notice: jest.fn(),
}), { virtual: true });
jest.mock('./settings', () => ({}));
jest.mock('./cm6/asyncViewPlugin', () => ({ asyncDecoBuilderExt: [] as unknown[], refreshInfluxEditorDecorations: jest.fn() }));
jest.mock('./apiAdapter', () => ({}));
jest.mock('./InfluxFile', () => ({ __esModule: true, default: { create: jest.fn() } }));

import * as React from 'react';
import InfluxFile from './InfluxFile';
import ObsidianInflux, { DEFAULT_SETTINGS } from './main';

test('refreshing a reading view keeps collapsed cards, while changing notes resets them', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const plugin = new ObsidianInflux({} as any, {} as any);
    plugin.componentCallbacks = {};
    plugin.data = { settings: { ...DEFAULT_SETTINGS } as any };
    plugin.stylesheetForPreview = {
        classes: { inlinkedEntries: 'entries', inlinkedEntry: 'entry' },
        toString: () => '', detach: jest.fn(),
    } as any;
    plugin.api = { getSettings: () => plugin.data.settings, dispose: jest.fn() } as any;
    const container = document.createElement('div');
    container.innerHTML = '<div class="markdown-preview-view"></div>';
    document.body.append(container);
    const leaf = { containerEl: container, view: { file: { path: 'Target.md' } } } as any;
    let generation = 0;
    (InfluxFile.create as jest.Mock).mockImplementation(async path => ({
        file: { path }, uuid: `generation-${++generation}`, api: plugin.api, influx: plugin,
        show: true, collapsed: false, prepare: async () => true,
        components: [{
            inlinkingFile: { file: { path: 'Source.md', basename: 'Source' } },
            titleInnerHTML: '', innerHTML: `<p>Excerpt ${generation}</p>`,
        }],
    }));

    try {
        await React.act(async () => { await plugin.updateInfluxInPreview(leaf); });
        await React.act(async () => {
            container.querySelector('.search-result .collapse-icon')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(container.querySelector('.search-result.is-collapsed')).not.toBeNull();
        await React.act(async () => { await plugin.updateInfluxInPreview(leaf); });
        expect(container.querySelector('.entry')?.textContent).toBe('Excerpt 2');
        expect(container.querySelector('.search-result.is-collapsed')).not.toBeNull();
        expect(Object.keys(plugin.componentCallbacks)).toEqual(['generation-2']);

        leaf.view.file.path = 'Other.md';
        await React.act(async () => { await plugin.updateInfluxInPreview(leaf); });
        expect(container.querySelector('.entry')?.textContent).toBe('Excerpt 3');
        expect(container.querySelector('.search-result.is-collapsed')).toBeNull();
    } finally {
        await React.act(async () => { await plugin.onunload(); });
        container.remove();
    }
});

test('layout cleanup keeps a connected preview in another window document', () => {
    const plugin = new ObsidianInflux({} as any, {} as any);
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const container = frame.contentDocument!.createElement('influx-preview-container');
    frame.contentDocument!.body.append(container);
    const root = { unmount: jest.fn() };
    (plugin as any).previewReactRoots.set(container, root);
    try {
        (plugin as any).cleanupReactRoots();
        expect(root.unmount).not.toHaveBeenCalled();
        container.remove();
        (plugin as any).cleanupReactRoots();
        expect(root.unmount).toHaveBeenCalledTimes(1);
    } finally {
        frame.remove();
    }
});

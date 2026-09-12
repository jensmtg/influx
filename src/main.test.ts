/** @jest-environment jsdom */

jest.mock('obsidian', () => ({
    Plugin: class {},
    TAbstractFile: class {},
    TFile: class {
        path: string;
        constructor(path: string) { this.path = path; }
    },
}), { virtual: true });
jest.mock('./settings', () => ({}));
jest.mock('./cm6/asyncViewPlugin', () => ({
    asyncDecoBuilderExt: [] as any[], refreshInfluxEditorDecorations: jest.fn(async () => {}),
}));
jest.mock('./InfluxFile', () => ({}));
jest.mock('./InfluxReactComponent', () => ({}));
jest.mock('./createStyleSheet', () => ({ createStyleSheet: jest.fn() }));
jest.mock('./apiAdapter', () => ({}));

import { TFile } from 'obsidian';
import ObsidianInflux, { DEFAULT_SETTINGS } from './main';
import { refreshInfluxEditorDecorations } from './cm6/asyncViewPlugin';

function pluginFixture(liveUpdate: boolean, useBacklinkCache: boolean) {
    const plugin = new (ObsidianInflux as any)() as ObsidianInflux;
    const callback = jest.fn(async () => {});
    plugin.data = { settings: { ...DEFAULT_SETTINGS, liveUpdate, useBacklinkCache } as any };
    plugin.componentCallbacks = { card: callback };
    plugin.api = { invalidateFileCache: jest.fn(), invalidateSettingsCache: jest.fn() } as any;
    plugin.updateInfluxInAllPreviews = jest.fn(async () => {});
    return { plugin, callback };
}

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

describe.each([false, true])('cache enabled: %s', useBacklinkCache => {
    test.each([false, true])('opening a note loads sections with live refresh %s', async liveUpdate => {
        const { plugin, callback } = pluginFixture(liveUpdate, useBacklinkCache);
        plugin.triggerUpdates('file-open', new (TFile as any)('Target.md'));
        await jest.runAllTimersAsync();
        expect(refreshInfluxEditorDecorations).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(plugin.updateInfluxInAllPreviews).toHaveBeenCalledTimes(1);
    });

    test('skips live changes when disabled', async () => {
        const { plugin, callback } = pluginFixture(false, useBacklinkCache);
        plugin.triggerUpdates('modify', new (TFile as any)('Source.md'));
        await jest.runAllTimersAsync();
        expect(callback).not.toHaveBeenCalled();
        expect(refreshInfluxEditorDecorations).not.toHaveBeenCalled();
        expect(plugin.updateInfluxInAllPreviews).not.toHaveBeenCalled();
    });

    test('batches related and unrelated changes into one live refresh', async () => {
        const { plugin, callback } = pluginFixture(true, useBacklinkCache);
        const first = new (TFile as any)('Source.md');
        const second = new (TFile as any)('Other.md');
        plugin.triggerUpdates('modify', first);
        plugin.triggerUpdates('modify', second);
        await jest.runAllTimersAsync();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith('modify', plugin.stylesheet, [first, second]);
        expect(refreshInfluxEditorDecorations).toHaveBeenCalledTimes(1);
        expect(plugin.pendingUpdates.size).toBe(0);
    });
});

test('cancels a queued live refresh when the option is turned off', async () => {
    const { plugin, callback } = pluginFixture(true, false);
    plugin.triggerUpdates('modify', new (TFile as any)('Source.md'));
    plugin.data.settings.liveUpdate = false;
    await jest.runAllTimersAsync();
    expect(callback).not.toHaveBeenCalled();
    expect(plugin.pendingUpdates.size).toBe(0);
});

test.each(['rename', 'delete'])('%s invalidates file paths before the update debounce', async op => {
    const { plugin } = pluginFixture(false, true);
    plugin.triggerUpdates(op, new (TFile as any)('Source.md'));
    expect(plugin.api.invalidateFileCache).toHaveBeenCalledTimes(1);
    await jest.runAllTimersAsync();
    expect(plugin.api.invalidateFileCache).toHaveBeenCalledTimes(1);
});

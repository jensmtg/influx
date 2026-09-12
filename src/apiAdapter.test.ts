jest.mock('obsidian', () => ({
    Component: class MockComponent {
        load() {}
        unload() {}
    },
    MarkdownRenderer: { renderMarkdown: jest.fn() },
    getLinkpath: (link: string) => link.split('#')[0],
    TFile: class MockTFile {
        path: string;
        constructor(path: string) {
            this.path = path;
        }
    },
}), { virtual: true });

jest.mock('./main', () => ({
    DEFAULT_SETTINGS: {
        useBacklinkCache: false,
        includeFrontmatterLinks: false,
        frontmatterProperties: [] as string[],
    },
}));

import { TFile } from 'obsidian';
import { ApiAdapter } from './apiAdapter';

describe('ApiAdapter backlink reliability', () => {
    test('retries an empty result but caches a populated result', async () => {
        const link = { link: 'Target' };
        const nativeBacklinks = jest.fn()
            .mockReturnValueOnce({ data: new Map() })
            .mockReturnValue({ data: new Map([['Source.md', [link]]]) });
        const app = {
            metadataCache: {
                getBacklinksForFile: nativeBacklinks,
                getFileCache: jest.fn((): null => null),
            },
            plugins: {
                plugins: {
                    influx: {
                        data: {
                            settings: {
                                useBacklinkCache: false,
                                includeFrontmatterLinks: false,
                                frontmatterProperties: [] as string[],
                            },
                        },
                    },
                },
            },
        } as any;
        const adapter = new ApiAdapter(app);
        const file = new (TFile as any)('Target.md');

        await expect(adapter.getBacklinks(file)).resolves.toMatchObject({
            incomingSourcePaths: [],
        });
        await expect(adapter.getBacklinks(file)).resolves.toMatchObject({
            incomingSourcePaths: ['Source.md'],
        });
        await adapter.getBacklinks(file);

        expect(nativeBacklinks).toHaveBeenCalledTimes(2);
    });
});

function adapterWithProvider(provider: any, useBacklinkCache = true) {
    const app = {
        metadataCache: { getBacklinksForFile: provider, getFileCache: (): null => null },
        plugins: { plugins: { influx: { data: { settings: { useBacklinkCache } } } } },
    } as any;
    return { app, adapter: new ApiAdapter(app), file: new (TFile as any)('Target.md') as TFile };
}

const populated = (path = 'Source.md') => ({ data: new Map([[path, [{ link: 'Target' }]]]) });

test('refreshes a populated local cache when Backlink Cache loads or unloads', async () => {
    const originalFn = jest.fn(() => populated('Native.md'));
    const { app, adapter, file } = adapterWithProvider(originalFn);
    expect((await adapter.getBacklinks(file)).incomingSourcePaths).toEqual(['Native.md']);
    app.metadataCache.getBacklinksForFile = Object.assign(jest.fn(), {
        originalFn, safe: jest.fn(async () => populated('Cached.md')),
    });
    expect((await adapter.getBacklinks(file)).incomingSourcePaths).toEqual(['Cached.md']);
    app.metadataCache.getBacklinksForFile = originalFn;
    expect((await adapter.getBacklinks(file)).incomingSourcePaths).toEqual(['Native.md']);
});

test('notices a safe method added to an existing provider function', async () => {
    const provider = jest.fn(() => populated('Native.md'));
    const { adapter, file } = adapterWithProvider(provider);
    await adapter.getBacklinks(file);
    Object.assign(provider, {
        originalFn: () => populated('Native.md'), safe: async () => populated('Cached.md'),
    });
    expect((await adapter.getBacklinks(file)).incomingSourcePaths).toEqual(['Cached.md']);
});

test('switches to native results when cache integration is disabled in settings', async () => {
    const originalFn = jest.fn(() => populated('Native.md'));
    const safe = jest.fn(async () => populated('Cached.md'));
    const { app, adapter, file } = adapterWithProvider(Object.assign(jest.fn(), { originalFn, safe }));
    await adapter.getBacklinks(file);
    app.plugins.plugins.influx.data.settings.useBacklinkCache = false;
    adapter.invalidateSettingsCache();
    expect((await adapter.getBacklinks(file)).incomingSourcePaths).toEqual(['Native.md']);
    expect(safe).toHaveBeenCalledTimes(1);
    expect(originalFn).toHaveBeenCalledTimes(1);
});

test('shares concurrent requests and retries results invalidated during a load', async () => {
    let release!: (value: any) => void;
    const safe = jest.fn()
        .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
        .mockResolvedValue(populated('Current.md'));
    const { adapter, file } = adapterWithProvider(Object.assign(jest.fn(), {
        originalFn: () => populated(), safe,
    }));
    const first = adapter.getBacklinks(file);
    const second = adapter.getBacklinks(file);
    await Promise.resolve();
    adapter.invalidateBacklinksCache();
    release(populated('Stale.md'));
    const results = await Promise.all([first, second]);
    expect(results.map(result => result.incomingSourcePaths)).toEqual([['Current.md'], ['Current.md']]);
    expect(safe).toHaveBeenCalledTimes(2);
});

test('bounds simultaneous backlink requests and cancels queued work on unload', async () => {
    const releases: Array<(value: any) => void> = [];
    const safe = jest.fn(() => new Promise(resolve => { releases.push(resolve); }));
    const { adapter } = adapterWithProvider(Object.assign(jest.fn(), {
        originalFn: () => populated(), safe,
    }));
    const requests = Array.from({ length: 20 }, (_, index) => adapter.getBacklinks(new (TFile as any)(`Target${index}.md`)));
    const done = Promise.allSettled(requests);
    await Promise.resolve();
    expect(safe).toHaveBeenCalledTimes(8);
    adapter.dispose();
    for (const release of releases) release(populated());
    expect((await done).every(result => result.status === 'rejected')).toBe(true);
    expect(safe).toHaveBeenCalledTimes(8);
});

test.each(['map', 'object'])('ignores malformed %s backlink groups without losing valid sources', async shape => {
    const groups: any = [['Broken.md', undefined], ['Source.md', [{ link: 'Target' }]]];
    const data = shape === 'map' ? new Map(groups) : Object.fromEntries(groups);
    const { adapter, file } = adapterWithProvider(() => ({ data }), false);
    expect((await adapter.getBacklinks(file)).incomingSourcePaths).toEqual(['Source.md']);
    expect(data instanceof Map ? data.has('Broken.md') : 'Broken.md' in data).toBe(true);
});

test('resolves relative links, headings and same-named targets from the source note', () => {
    const { app, adapter, file } = adapterWithProvider(() => populated());
    app.metadataCache.getFirstLinkpathDest = jest.fn((link: string) =>
        link === '../Target' ? file : { path: 'Other/Target.md' });
    expect(adapter.isLinkToFile({ link: '../Target#Heading' } as any, 'Folder/Source.md', file)).toBe(true);
    expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('../Target', 'Folder/Source.md');
    expect(adapter.isLinkToFile({ link: 'Other/Target' } as any, 'Folder/Source.md', file)).toBe(false);
    expect(adapter.isLinkToFile({} as any, 'Folder/Source.md', file)).toBe(false);
});

/** @jest-environment jsdom */

jest.mock('uuid', () => ({ v4: () => 'test-influx' }));
jest.mock('obsidian', () => ({
    Component: class { load = jest.fn(); unload = jest.fn(); },
    TFile: class {
        path: string;
        basename: string;
        stat = { ctime: 1, mtime: 1 };
        constructor(path: string) {
            this.path = path;
            this.basename = path.split('/').pop()!.replace(/\.md$/, '');
        }
    },
    getLinkpath: (link: string) => link.split('#')[0],
    Keymap: { isModEvent: jest.fn((event: MouseEvent) =>
        event.button === 1 || event.metaKey || event.ctrlKey ? (event.shiftKey ? 'split' : 'tab') : false) },
    Notice: jest.fn(),
    MarkdownRenderer: { render: jest.fn(async (_app: unknown, markdown: string, element: HTMLElement) => {
        element.innerHTML = markdown.startsWith('&#32;')
            ? '<p> Title <a class="internal-link" data-href="../Linked#Details"><strong>Title link</strong></a></p>'
            : '<p>Preview <a class="internal-link" data-href="./Sibling#^part"><em>Preview link</em></a> <a class="external-link" href="https://example.com">Website</a></p>';
    }) },
}), { virtual: true });
jest.mock('./main', () => ({ DEFAULT_SETTINGS: {
    liveUpdate: true, useBacklinkCache: false, includeFrontmatterLinks: false,
    showBehaviour: 'OPT_OUT', sourceBehaviour: 'OPT_OUT',
    listLimit: 0, entryHeaderVisible: true, variant: 'CENTER_ALIGNED',
    sortingAttribute: 'ctime', sortingPrinciple: 'NEWEST_FIRST',
    inclusionPattern: [] as string[], exclusionPattern: [] as string[], collapsedPattern: [] as string[],
    sourceInclusionPattern: [] as string[], sourceExclusionPattern: [] as string[],
} }));

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TFile, MarkdownRenderer, Keymap, Notice } from 'obsidian';
import { ApiAdapter } from './apiAdapter';
import InfluxFile from './InfluxFile';
import InfluxReactComponent from './InfluxReactComponent';

const sheet = { classes: { inlinkedEntries: 'entries', inlinkedEntry: 'entry' }, toString: () => '' } as any;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    jest.clearAllMocks();
});
afterEach(async () => {
    await React.act(async () => root.unmount());
    container.remove();
});

async function fixture(useBacklinkCache = false, liveUpdate = true, shape = 'map', provider = 'cached') {
    const target = new (TFile as any)('Targets/Target.md') as TFile;
    const source = new (TFile as any)('Sources/Source.md') as TFile;
    const link = { link: '../Targets/Target', position: { start: { line: 2 } } };
    const result = { data: shape === 'map' ? new Map([[source.path, [link]]]) : { [source.path]: [link] } };
    const native = jest.fn(() => result);
    const safe = jest.fn(async () => {
        if (provider === 'failure') throw new Error('Optional cache unavailable');
        return provider === 'empty' ? { data: new Map() } : result;
    });
    const patched = Object.assign(jest.fn(() => result), { originalFn: native, safe });
    const settings = { useBacklinkCache, liveUpdate };
    const openLinkText = jest.fn(async (_linktext: string, sourcePath: string) => {
        // Obsidian's path resolver requires this argument even for full note paths.
        sourcePath.lastIndexOf('/');
    });
    const app = {
        workspace: { openLinkText },
        vault: {
            getAbstractFileByPath: (path: string) => [target, source].find(file => file.path === path),
            cachedRead: async () => '# Source title\n\nA mention of [[../Targets/Target]].',
        },
        metadataCache: {
            getBacklinksForFile: provider === 'absent' ? native : patched,
            getFileCache: (file: TFile) => file === target ? {} : {
                links: [link], headings: [{ heading: 'Source title', position: { start: { line: 0 } } }],
            },
            getFirstLinkpathDest: () => target,
        },
        plugins: { plugins: { influx: { data: { settings } } } },
    } as any;
    const callbacks = new Map<string, any>();
    const plugin = {
        stylesheetForPreview: sheet,
        data: { settings },
        registerInfluxComponent: (id: string, callback: any) => callbacks.set(id, callback),
        deregisterInfluxComponent: (id: string) => callbacks.delete(id),
    } as any;
    const api = new ApiAdapter(app);
    const file = await InfluxFile.create(target.path, api, plugin);
    await file.prepare();
    return { file, source, target, app, api, callbacks, native, safe, openLinkText };
}

async function mount(file: InfluxFile, preview = false) {
    await React.act(async () => {
        root.render(React.createElement(InfluxReactComponent, { influxFile: file, preview, sheet }));
    });
}

async function click(selector: string, init: MouseEventInit = {}, type = 'click') {
    const element = container.querySelector(selector)!;
    expect(element).not.toBeNull();
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
    await React.act(async () => { element.dispatchEvent(event); });
    return event;
}

describe.each([false, true])('cache enabled: %s', useBacklinkCache => {
    describe.each([false, true])('live refresh enabled: %s', liveUpdate => {
        describe.each([false, true])('reading view: %s', preview => {
            test.each(['map', 'object'])('opens both titles and preview links with %s backlinks', async shape => {
                const { file, source, openLinkText, native, safe } = await fixture(useBacklinkCache, liveUpdate, shape);
                await mount(file, preview);
                const hostClick = jest.fn();
                container.addEventListener('click', hostClick);

                await click('.tree-item-inner a');
                expect(openLinkText).toHaveBeenLastCalledWith(source.path, source.path, false);
                await click('h2 strong');
                expect(openLinkText).toHaveBeenLastCalledWith('../Linked#Details', source.path, false);
                await click('.entry em');
                expect(openLinkText).toHaveBeenLastCalledWith('./Sibling#^part', source.path, false);
                expect(hostClick).not.toHaveBeenCalled();
                expect(openLinkText).toHaveBeenCalledTimes(3);
                expect(safe).toHaveBeenCalledTimes(useBacklinkCache ? 1 : 0);
                expect(native).toHaveBeenCalledTimes(useBacklinkCache ? 0 : 1);
                expect(MarkdownRenderer.render).toHaveBeenCalledWith(file.api.app, expect.any(String), expect.any(HTMLElement), source.path, expect.anything());
            });
        });
    });
});

test.each(['absent', 'empty', 'failure'])('opens titles when the optional cache is %s', async provider => {
    const { file, source, openLinkText } = await fixture(true, false, 'map', provider);
    await mount(file);
    await click('.tree-item-inner a');
    expect(openLinkText).toHaveBeenCalledWith(source.path, source.path, false);
});

test.each([
    ['click', { metaKey: true }, 'tab'],
    ['click', { ctrlKey: true }, 'tab'],
    ['click', { metaKey: true, shiftKey: true }, 'split'],
    ['auxclick', { button: 1 }, 'tab'],
] as const)('passes %s modifiers to Obsidian: %j', async (type, init, expected) => {
    const { file, source, openLinkText } = await fixture();
    await mount(file);
    const event = await click('.tree-item-inner a', init, type);
    expect(Keymap.isModEvent).toHaveBeenCalledWith(event);
    expect(openLinkText).toHaveBeenCalledWith(source.path, source.path, expected);
    expect(event.defaultPrevented).toBe(true);
});

test('leaves external links and right clicks to their normal handlers', async () => {
    const { file, openLinkText } = await fixture();
    await mount(file);
    const hostClick = jest.fn((event: Event) => event.preventDefault());
    container.addEventListener('click', hostClick);
    await click('.external-link');
    await click('.tree-item-inner a', { button: 2 }, 'auxclick');
    expect(openLinkText).not.toHaveBeenCalled();
    expect(hostClick).toHaveBeenCalledTimes(1);
});

test('contains link-opening failures instead of leaving rejected promises', async () => {
    const { file, openLinkText } = await fixture();
    openLinkText.mockRejectedValueOnce(new Error('File unavailable'));
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await mount(file);
    await click('.tree-item-inner a');
    expect(Notice).toHaveBeenCalledWith('Influx could not open this note.');
    errors.mockRestore();
});

test('coalesces rapid changes without losing an earlier relevant source', async () => {
    const { file, source, callbacks } = await fixture();
    await mount(file);
    const prepare = jest.spyOn(file, 'prepare');
    const shouldUpdate = jest.spyOn(file, 'shouldUpdate');
    const callback = callbacks.get(file.uuid);
    await React.act(async () => {
        const first = callback('modify', sheet, [source]);
        const second = callback('modify', sheet, [{ path: 'Unrelated.md' }]);
        await Promise.all([first, second]);
    });
    expect(shouldUpdate).toHaveBeenCalledWith([source, { path: 'Unrelated.md' }]);
    expect(prepare).toHaveBeenCalledTimes(1);
});

test('keeps a full refresh when a modify event overtakes it', async () => {
    const { file, callbacks } = await fixture();
    await mount(file);
    const prepare = jest.spyOn(file, 'prepare');
    const shouldUpdate = jest.spyOn(file, 'shouldUpdate');
    const callback = callbacks.get(file.uuid);
    await React.act(async () => {
        await Promise.all([
            callback('save-settings', sheet),
            callback('modify', sheet, [{ path: 'Unrelated.md' }]),
        ]);
    });
    expect(prepare).toHaveBeenCalledWith(true);
    expect(shouldUpdate).not.toHaveBeenCalled();
});

test('keeps changes that arrive while a refresh is awaiting backlinks', async () => {
    const { file, source, callbacks } = await fixture();
    await mount(file);
    let release!: (value: boolean) => void;
    const shouldUpdate = jest.spyOn(file, 'shouldUpdate')
        .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const prepare = jest.spyOn(file, 'prepare');
    const callback = callbacks.get(file.uuid);
    await React.act(async () => {
        const first = callback('modify', sheet, [source]);
        await Promise.resolve();
        const second = callback('modify', sheet, [{ path: 'Unrelated.md' }]);
        release(true);
        await Promise.all([first, second]);
    });
    expect(shouldUpdate).toHaveBeenLastCalledWith([source, { path: 'Unrelated.md' }]);
    expect(prepare).toHaveBeenCalledTimes(1);
});

test('keeps relative link context through nested embedded previews', async () => {
    const { api, file, app, openLinkText } = await fixture();
    app.metadataCache.getFirstLinkpathDest = jest.fn((link: string, source: string) => ({
        path: link === '../Embedded' ? 'Embeds/Embedded.md' : `${source.split('/')[0]}/Deep.md`,
    }));
    (MarkdownRenderer.render as jest.Mock).mockImplementationOnce(async (_app, _markdown, element) => {
        element.innerHTML = '<div class="internal-embed" src="../Embedded"><a class="internal-link" data-href="./Sibling">Outer</a><div class="internal-embed" src="./Deep"><a class="internal-link" data-href="#Heading"><strong>Nested</strong></a></div></div>';
    });
    file.components[0].innerHTML = await api.renderMarkdown('Embed', 'Sources/Source.md');
    await mount(file);
    await click('.entry strong');
    expect(openLinkText).toHaveBeenCalledWith('#Heading', 'Embeds/Deep.md', false);
    expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('./Deep', 'Embeds/Embedded.md');
});

test('a failed Markdown render leaves other cards available and unloads its children', async () => {
    const { api, source } = await fixture();
    const render = MarkdownRenderer.render as jest.Mock;
    const original = render.getMockImplementation()!;
    render.mockImplementation(async (...args) => {
        if (args[3] === 'Broken.md') throw new Error('Bad preview renderer');
        return original(...args);
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const results = await api.renderAllMarkdownBlocks([
        { file: new (TFile as any)('Broken.md'), title: '', summary: 'Broken' },
        { file: source, title: '', summary: 'Good' },
    ] as any);
    expect(results.map(result => result.inlinkingFile.file.path)).toEqual([source.path]);
    const failedCall = render.mock.calls.find(call => call[3] === 'Broken.md')!;
    expect(failedCall[4].unload).toHaveBeenCalledTimes(1);
    render.mockImplementation(original);
    errors.mockRestore();
});

test('bounds Markdown rendering across multiple open sections', async () => {
    const { api } = await fixture();
    const render = MarkdownRenderer.render as jest.Mock;
    const original = render.getMockImplementation()!;
    let active = 0;
    let peak = 0;
    render.mockImplementation(async (_app, _markdown, element) => {
        peak = Math.max(peak, ++active);
        await Promise.resolve();
        element.innerHTML = '<p>Preview</p>';
        active--;
    });
    const sources = Array.from({ length: 12 }, (_, index) => ({
        file: new (TFile as any)(`Source${index}.md`), title: 'Title', summary: 'Summary',
    }));
    const results = await Promise.all([
        api.renderAllMarkdownBlocks(sources as any),
        api.renderAllMarkdownBlocks(sources as any),
    ]);
    expect(results.map(result => result.length)).toEqual([12, 12]);
    expect(peak).toBe(8);
    render.mockImplementation(original);
});

test('reusing a root refreshes the content while keeping collapsed cards', async () => {
    const { file } = await fixture();
    await mount(file);
    await click('.search-result .collapse-icon');
    const refreshed = Object.assign(Object.create(Object.getPrototypeOf(file)), file, {
        uuid: 'refreshed-file', components: [{ ...file.components[0], innerHTML: '<p>New excerpt</p>' }],
    }) as InfluxFile;
    await mount(refreshed);
    expect(container.querySelector('.entry')?.textContent).toBe('New excerpt');
    expect((container.querySelector('.search-result-file-matches') as HTMLElement).style.display).toBe('none');
});

test('renders titles inline without adding Markdown emphasis or deleting real underscores', async () => {
    const { api, source } = await fixture();
    const render = MarkdownRenderer.render as jest.Mock;
    render.mockClear();
    render.mockImplementationOnce(async (_app, markdown, element) => {
        element.innerHTML = `<p>${markdown}</p>`;
    });
    const results = await api.renderAllMarkdownBlocks([
        { file: source, title: 'Source_\n[[Linked]]', summary: 'Preview' },
    ] as any);
    expect(render.mock.calls[0][1]).toBe('&#32;Source_ [[Linked]]');
    expect(results[0].titleInnerHTML).toBe('Source_ [[Linked]]');
});

test.each([false, true])('keeps task checkbox state and native Markdown styles in reading view: %s', async preview => {
    const { api, file } = await fixture();
    (MarkdownRenderer.render as jest.Mock).mockImplementationOnce(async (_app, _markdown, element) => {
        element.innerHTML = '<ul><li class="task-list-item"><input type="checkbox">Done</li><li class="task-list-item"><input type="checkbox" checked>Open</li></ul>';
        const inputs = element.querySelectorAll('input');
        inputs[0].checked = true;
        inputs[1].checked = false;
    });
    file.components[0].innerHTML = await api.renderMarkdown('Tasks', 'Sources/Source.md');
    await mount(file, preview);
    expect(container.querySelector('.entry')?.classList.contains('markdown-rendered')).toBe(true);
    const inputs = container.querySelectorAll<HTMLInputElement>('.entry input');
    expect(Array.from(inputs, input => input.checked)).toEqual([true, false]);
    expect(Array.from(inputs, input => input.disabled)).toEqual([true, true]);
});

import { InlinkingFile } from './InlinkingFile';

test('builds excerpts for embedded links as well as ordinary links', async () => {
    const file = { path: 'Source.md' } as any;
    const target = { file: { path: 'Target.md' } } as any;
    const api = {
        readFile: async () => '# Heading\n\nAn embedded note: ![[Target]].',
        getMetadata: () => ({ embeds: [{ link: 'Target', position: { start: { line: 2 } } }] }),
        isLinkToFile: () => true,
    } as any;
    const source = new InlinkingFile(file, api);
    await source.makeSummary(target);
    expect(source.summary).toContain('![[Target]]');
});

test('incomplete heading and link positions do not break a card', async () => {
    const api = {
        readFile: async () => '# Heading',
        getMetadata: () => ({ headings: [{ heading: 'Heading', position: {} }], links: [{ link: 'Target', position: {} }] }),
        isLinkToFile: () => true,
    } as any;
    const source = new InlinkingFile({ path: 'Source.md' } as any, api);
    await expect(source.makeSummary({ file: { path: 'Target.md' } } as any)).resolves.toBeUndefined();
    expect(source.title).toBe('Heading');
    expect(source.titleLineNum).toBeUndefined();
});

test.each([{}, ['Title'], 123, true, '   '])('ignores invalid custom title %j', title => {
    const source = new InlinkingFile({ path: 'Source.md' } as any, {} as any);
    source.setTitle({
        frontmatter: { 'influx-title': title },
        headings: [{ heading: 'Heading', position: { start: { line: 3 } } }],
    } as any);
    expect(source.title).toBe('Heading');
    expect(source.titleLineNum).toBe(3);
});

test('does not hide a custom title because a different heading contains a link', async () => {
    const source = new InlinkingFile({ path: 'Source.md' } as any, {
        readFile: async () => '# [[Target]]\n\nUnrelated paragraph',
        getMetadata: () => ({
            frontmatter: { 'influx-title': 'Custom title' },
            headings: [{ heading: '[[Target]]', position: { start: { line: 0 } } }],
            links: [{ link: 'Target', position: { start: { line: 0 } } }],
        }),
        isLinkToFile: () => true,
    } as any);
    await source.makeSummary({ file: { path: 'Target.md' } } as any);
    expect(source.title).toBe('Custom title');
    expect(source.isLinkInTitle).toBe(false);
    expect(source.summary).not.toContain('Unrelated paragraph');
});

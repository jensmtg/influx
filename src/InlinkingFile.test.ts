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

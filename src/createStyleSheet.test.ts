import { createStyleSheet } from './createStyleSheet';

function ruleFor(css: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`))?.[0] ?? '';
}

describe('createStyleSheet', () => {
    test.each([false, true])('keeps task markers in normal flow in reading view: %s', preview => {
        const sheet = createStyleSheet({ getSettings: () => ({ fontSize: 13 }) } as any, preview);
        try {
            const css = sheet.toString();
            const root = `.${sheet.classes.influxComponent}`;
            const entry = `.${sheet.classes.inlinkedEntry}`;
            expect(ruleFor(css, root)).toContain('white-space: normal;');
            expect(ruleFor(css, `${entry} input[type=checkbox]`)).toContain('margin-block: 0;');
            expect(ruleFor(css, `${entry} input[type=checkbox]`)).toContain('vertical-align: middle;');
            expect(css).not.toMatch(/margin-(?:top|bottom|block(?:-start|-end)?): -/);
            expect(ruleFor(css, `${root} .search-result-file-matches`)).toContain('min-width: 0;');
        } finally {
            sheet.detach();
        }
    });

    test.each(['CENTER_ALIGNED', 'ROWS'] as const)(
        'keeps backlink wrappers content-sized in the %s variant',
        (variant) => {
            const sheet = createStyleSheet({
                getSettings: () => ({
                    fontSize: 13,
                    variant,
                }),
            } as any);

            try {
                const css = sheet.toString();
                const root = `.${sheet.classes.influxComponent}`;
                const entries = ruleFor(css, `.${sheet.classes.inlinkedEntries}`);

                expect(ruleFor(css, `${root} .backlink-pane`)).toContain('flex: 0 0 auto;');
                expect(ruleFor(css, `${root} .search-result-container`)).toContain('flex: 0 0 auto;');
                expect(entries).toContain('display: flex;');
                expect(entries).not.toContain('flex-grow');
            } finally {
                sheet.detach();
            }
        },
    );
});

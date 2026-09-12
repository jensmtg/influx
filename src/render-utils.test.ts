import { shouldRenderInfluxForMarkdownElement } from './render-utils';

function elementWithContext(options: {
	liveEditorContext?: Element | null;
	tableContext?: Element | null;
	parentPreviewContext?: Element | null;
} = {}): HTMLElement {
	const parentElement = {
		closest: jest.fn().mockReturnValue(options.parentPreviewContext ?? null),
	} as unknown as HTMLElement;

	return {
		closest: jest.fn((selector: string) => {
			if (selector.includes('.cm-editor')) {
				return options.liveEditorContext ?? null;
			}
			return options.tableContext ?? null;
		}),
		parentElement,
	} as unknown as HTMLElement;
}

describe('Render Utils', () => {
	describe('shouldRenderInfluxForMarkdownElement', () => {
		test('allows note-level markdown preview elements', () => {
			const element = elementWithContext();

			expect(shouldRenderInfluxForMarkdownElement(element)).toBe(true);
			expect(element.closest).toHaveBeenCalledWith(expect.stringContaining('table'));
			expect(element.parentElement?.closest).toHaveBeenCalledWith('.markdown-preview-view, .markdown-reading-view');
		});

		test('rejects elements inside table render contexts', () => {
			const element = elementWithContext({ tableContext: {} as Element });

			expect(shouldRenderInfluxForMarkdownElement(element)).toBe(false);
			expect(element.parentElement?.closest).not.toHaveBeenCalled();
		});

		test('rejects preview postprocessing inside the live editor', () => {
			const element = elementWithContext({ liveEditorContext: {} as Element });

			expect(shouldRenderInfluxForMarkdownElement(element)).toBe(false);
			expect(element.parentElement?.closest).not.toHaveBeenCalled();
		});

		test('rejects nested markdown preview elements inside another preview', () => {
			const element = elementWithContext({ parentPreviewContext: {} as Element });

			expect(shouldRenderInfluxForMarkdownElement(element)).toBe(false);
		});
	});
});

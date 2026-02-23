import type { Root } from 'react-dom/client';
import { rootManager } from '../../src/react/RootManager';
import { asHTMLElement, createFakeElement } from '../helpers/fake-dom';

jest.mock('../../src/utils/logger', () => ({
	logger: {
		error: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));

function createMockRoot(): Root {
	return {
		render: jest.fn(),
		unmount: jest.fn(),
	} as unknown as Root;
}

describe('RootManager', () => {
	const originalDocument = (globalThis as { document?: Document }).document;
	const containsMock = jest.fn<boolean, [Node | null]>();

	beforeEach(() => {
		(globalThis as { document?: Document }).document = {
			body: {
				contains: containsMock as unknown as (node: Node | null) => boolean,
			},
		} as Document;
		containsMock.mockReset();
		containsMock.mockReturnValue(true);
		rootManager.unmountAll();
	});

	afterEach(() => {
		rootManager.unmountAll();
		(globalThis as { document?: Document }).document = originalDocument;
	});

	test('supports multiple roots for the same file path and unmounts by type', () => {
		const filePath = 'Work Projects.md';
		const editorContainer = asHTMLElement(createFakeElement('div'));
		const previewContainer = asHTMLElement(createFakeElement('div'));

		const editorRoot = createMockRoot();
		const previewRoot = createMockRoot();

		rootManager.register(editorContainer, editorRoot, 'editor', filePath);
		rootManager.register(previewContainer, previewRoot, 'preview', filePath);

		rootManager.unmountByFilePath(filePath, 'preview');

		expect(previewRoot.unmount).toHaveBeenCalledTimes(1);
		expect(editorRoot.unmount).not.toHaveBeenCalled();
		expect(rootManager.has(editorContainer)).toBe(true);
		expect(rootManager.has(previewContainer)).toBe(false);
	});

	test('cleanupStale skips transient editor roots but cleans stale preview roots', () => {
		const editorContainer = asHTMLElement(createFakeElement('div'));
		const previewContainer = asHTMLElement(createFakeElement('div'));

		const editorRoot = createMockRoot();
		const previewRoot = createMockRoot();

		rootManager.register(editorContainer, editorRoot, 'editor', 'Editor.md');
		rootManager.register(previewContainer, previewRoot, 'preview', 'Preview.md');
		containsMock.mockReturnValue(false);

		const cleaned = rootManager.cleanupStale();

		expect(cleaned).toBe(1);
		expect(previewRoot.unmount).toHaveBeenCalledTimes(1);
		expect(editorRoot.unmount).not.toHaveBeenCalled();
		expect(rootManager.has(editorContainer)).toBe(true);
		expect(rootManager.has(previewContainer)).toBe(false);
	});

	test('unmountByType removes only matching root type', () => {
		const editorContainer = asHTMLElement(createFakeElement('div'));
		const previewContainer = asHTMLElement(createFakeElement('div'));
		const sidebarContainer = asHTMLElement(createFakeElement('div'));

		const editorRoot = createMockRoot();
		const previewRoot = createMockRoot();
		const sidebarRoot = createMockRoot();

		rootManager.register(editorContainer, editorRoot, 'editor', 'Editor.md');
		rootManager.register(previewContainer, previewRoot, 'preview', 'Preview.md');
		rootManager.register(sidebarContainer, sidebarRoot, 'sidebar', 'Sidebar.md');

		rootManager.unmountByType('preview');

		expect(previewRoot.unmount).toHaveBeenCalledTimes(1);
		expect(editorRoot.unmount).not.toHaveBeenCalled();
		expect(sidebarRoot.unmount).not.toHaveBeenCalled();
		expect(rootManager.has(previewContainer)).toBe(false);
		expect(rootManager.has(editorContainer)).toBe(true);
		expect(rootManager.has(sidebarContainer)).toBe(true);
	});
});

import type { Root } from 'react-dom/client';
import { rootManager } from '@/platform/react/root-manager';
import { asHTMLElement, createFakeElement } from '../../helpers/fake-dom';

jest.mock('@/platform/diagnostics/logger', () => ({
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

	test('file path index stays correct across pane replacement cycles', () => {
		const filePath = 'Shared.md';
		const paneAOld = asHTMLElement(createFakeElement('div'));
		const paneB = asHTMLElement(createFakeElement('div'));
		const paneANew = asHTMLElement(createFakeElement('div'));

		const rootAOld = createMockRoot();
		const rootB = createMockRoot();
		const rootANew = createMockRoot();

		rootManager.register(paneAOld, rootAOld, 'preview', filePath);
		rootManager.register(paneB, rootB, 'preview', filePath);

		// Simulate pane A being recreated after layout/mode transitions.
		rootManager.unmount(paneAOld);
		rootManager.register(paneANew, rootANew, 'preview', filePath);

		rootManager.unmountByFilePath(filePath, 'preview');

		expect(rootAOld.unmount).toHaveBeenCalledTimes(1);
		expect(rootB.unmount).toHaveBeenCalledTimes(1);
		expect(rootANew.unmount).toHaveBeenCalledTimes(1);
		expect(rootManager.has(paneAOld)).toBe(false);
		expect(rootManager.has(paneB)).toBe(false);
		expect(rootManager.has(paneANew)).toBe(false);
	});

	test('cleanupStale is idempotent across repeated layout cleanup passes', () => {
		const previewContainer = asHTMLElement(createFakeElement('div'));
		const previewRoot = createMockRoot();

		rootManager.register(previewContainer, previewRoot, 'preview', 'Repeated.md');
		containsMock.mockReturnValue(false);

		const firstCleaned = rootManager.cleanupStale();
		const secondCleaned = rootManager.cleanupStale();

		expect(firstCleaned).toBe(1);
		expect(secondCleaned).toBe(0);
		expect(previewRoot.unmount).toHaveBeenCalledTimes(1);
	});
});

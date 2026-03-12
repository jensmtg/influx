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
		jest.useRealTimers();
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

	test('unmountByFilePath matches roots across slash differences without collapsing distinct-case paths', () => {
		const editorContainer = asHTMLElement(createFakeElement('div'));
		const previewContainer = asHTMLElement(createFakeElement('div'));
		const distinctCaseContainer = asHTMLElement(createFakeElement('div'));
		const editorRoot = createMockRoot();
		const previewRoot = createMockRoot();
		const distinctCaseRoot = createMockRoot();

		rootManager.register(editorContainer, editorRoot, 'editor', 'Folder\\MixedCase.md');
		rootManager.register(previewContainer, previewRoot, 'preview', 'Folder/MixedCase.md');
		rootManager.register(distinctCaseContainer, distinctCaseRoot, 'preview', 'Folder/mixedcase.md');

		rootManager.unmountByFilePath('Folder/mixedcase.md');

		expect(editorRoot.unmount).not.toHaveBeenCalled();
		expect(previewRoot.unmount).not.toHaveBeenCalled();
		expect(distinctCaseRoot.unmount).toHaveBeenCalledTimes(1);
		expect(rootManager.has(editorContainer)).toBe(true);
		expect(rootManager.has(previewContainer)).toBe(true);
		rootManager.unmountByFilePath('Folder\\MixedCase.md');

		expect(editorRoot.unmount).toHaveBeenCalledTimes(1);
		expect(previewRoot.unmount).toHaveBeenCalledTimes(1);
		expect(rootManager.size).toBe(0);
	});

	test('unregister removes normalized file path index entries', () => {
		const container = asHTMLElement(createFakeElement('div'));
		const root = createMockRoot();

		rootManager.register(container, root, 'preview', 'Folder\\CaseTest.md');
		rootManager.unregister(container);
		rootManager.unmountByFilePath('folder/casetest.md');

		expect(root.unmount).not.toHaveBeenCalled();
		expect(rootManager.size).toBe(0);
	});

	test('updateFilePath moves a tracked root between file path indexes', () => {
		const container = asHTMLElement(createFakeElement('div'));
		const root = createMockRoot();

		rootManager.register(container, root, 'sidebar', 'Folder/Old.md');
		rootManager.updateFilePath(container, 'Folder\\New.md');

		expect(rootManager.getContainersByFilePath('Folder/Old.md')).toEqual([]);
		expect(rootManager.getContainersByFilePath('Folder/New.md')).toEqual([container]);

		rootManager.unmountByFilePath('Folder/Old.md');
		expect(root.unmount).not.toHaveBeenCalled();

		rootManager.unmountByFilePath('Folder/New.md');
		expect(root.unmount).toHaveBeenCalledTimes(1);
	});

	test('rename and delete cleanup removes editor, preview, and sidebar roots across old and new paths', () => {
		const oldEditor = asHTMLElement(createFakeElement('div'));
		const oldPreview = asHTMLElement(createFakeElement('div'));
		const oldSidebar = asHTMLElement(createFakeElement('div'));
		const newEditor = asHTMLElement(createFakeElement('div'));
		const newPreview = asHTMLElement(createFakeElement('div'));
		const newSidebar = asHTMLElement(createFakeElement('div'));

		const oldEditorRoot = createMockRoot();
		const oldPreviewRoot = createMockRoot();
		const oldSidebarRoot = createMockRoot();
		const newEditorRoot = createMockRoot();
		const newPreviewRoot = createMockRoot();
		const newSidebarRoot = createMockRoot();

		rootManager.register(oldEditor, oldEditorRoot, 'editor', 'Folder\\Old.md');
		rootManager.register(oldPreview, oldPreviewRoot, 'preview', 'Folder/Old.md');
		rootManager.register(oldSidebar, oldSidebarRoot, 'sidebar', 'Folder/Old.md');

		rootManager.unmountByFilePath('Folder/Old.md');

		expect(oldEditorRoot.unmount).toHaveBeenCalledTimes(1);
		expect(oldPreviewRoot.unmount).toHaveBeenCalledTimes(1);
		expect(oldSidebarRoot.unmount).toHaveBeenCalledTimes(1);
		expect(rootManager.size).toBe(0);

		rootManager.register(newEditor, newEditorRoot, 'editor', 'Folder\\Renamed.md');
		rootManager.register(newPreview, newPreviewRoot, 'preview', 'Folder/Renamed.md');
		rootManager.register(newSidebar, newSidebarRoot, 'sidebar', 'Folder/Renamed.md');

		rootManager.unmountByFilePath('Folder/Renamed.md');

		expect(newEditorRoot.unmount).toHaveBeenCalledTimes(1);
		expect(newPreviewRoot.unmount).toHaveBeenCalledTimes(1);
		expect(newSidebarRoot.unmount).toHaveBeenCalledTimes(1);
		expect(rootManager.size).toBe(0);
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

	test('register replacement defers old root unmount to avoid sync render races', () => {
		jest.useFakeTimers();

		const container = asHTMLElement(createFakeElement('div'));
		const originalRoot = createMockRoot();
		const replacementRoot = createMockRoot();

		rootManager.register(container, originalRoot, 'preview', 'Shared.md');
		rootManager.register(container, replacementRoot, 'preview', 'Shared.md');

		expect(originalRoot.unmount).not.toHaveBeenCalled();
		expect(rootManager.get(container)?.root).toBe(replacementRoot);

		jest.runAllTimers();
		expect(originalRoot.unmount).toHaveBeenCalledTimes(1);
	});

	test('deferred unmount from a stale pane does not touch a re-registered replacement during re-enable cycles', () => {
		jest.useFakeTimers();

		const oldContainer = asHTMLElement(createFakeElement('div'));
		const replacementContainer = asHTMLElement(createFakeElement('div'));
		const oldRoot = createMockRoot();
		const replacementRoot = createMockRoot();

		rootManager.register(oldContainer, oldRoot, 'preview', 'Shared.md');
		rootManager.unmountDeferred(oldContainer);
		rootManager.register(replacementContainer, replacementRoot, 'preview', 'Shared.md');

		expect(rootManager.has(oldContainer)).toBe(false);
		expect(rootManager.get(replacementContainer)?.root).toBe(replacementRoot);
		expect(oldRoot.unmount).not.toHaveBeenCalled();
		expect(replacementRoot.unmount).not.toHaveBeenCalled();

		jest.runOnlyPendingTimers();

		expect(oldRoot.unmount).toHaveBeenCalledTimes(1);
		expect(replacementRoot.unmount).not.toHaveBeenCalled();
		expect(rootManager.get(replacementContainer)?.root).toBe(replacementRoot);
	});

	test('register calls that happen during unmountAll are rejected and immediately unmounted', () => {
		const existingContainer = asHTMLElement(createFakeElement('div'));
		const lateContainer = asHTMLElement(createFakeElement('div'));
		const lateRoot = createMockRoot();
		const existingRoot = {
			render: jest.fn(),
			unmount: jest.fn(() => {
				rootManager.register(lateContainer, lateRoot, 'preview', 'Late.md');
			}),
		} as unknown as Root;

		rootManager.register(existingContainer, existingRoot, 'preview', 'Existing.md');

		rootManager.unmountAll();

		expect(existingRoot.unmount).toHaveBeenCalledTimes(1);
		expect(lateRoot.unmount).toHaveBeenCalledTimes(1);
		expect(rootManager.size).toBe(0);
		expect(rootManager.has(lateContainer)).toBe(false);
	});
});

import { editorViewField } from 'obsidian';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { AsyncViewPluginController, refreshAllInfluxEditorViews } from '@/features/editor/codemirror/async-view-plugin';
import { StatefulDecorationSet } from '@/features/editor/codemirror/stateful-decoration-set';

jest.mock('@/features/editor/codemirror/stateful-decoration-set', () => ({
	StatefulDecorationSet: jest.fn(),
}));

type MockEditorView = Pick<EditorView, 'state'>;
type MockViewUpdate = Pick<ViewUpdate, 'view' | 'docChanged'>;

function createView(path: string | null): MockEditorView {
	return {
		state: {
			field: jest.fn((field: unknown) => {
				if (field === editorViewField) {
					return path ? { file: { path } } : null;
				}
				return null;
			}),
		},
	};
}

function createMutableView(initialPath: string | null) {
	let currentPath = initialPath;
	return {
		view: createViewProxy(() => currentPath),
		setPath: (nextPath: string | null) => {
			currentPath = nextPath;
		},
	};
}

function createViewProxy(getPath: () => string | null): MockEditorView {
	return {
		state: {
			field: jest.fn((field: unknown) => {
				if (field === editorViewField) {
					const path = getPath();
					return path ? { file: { path } } : null;
				}
				return null;
			}),
		},
	};
}

function createUpdate(params: { path: string | null; docChanged?: boolean }): MockViewUpdate {
	return {
		view: createView(params.path),
		docChanged: params.docChanged ?? false,
	};
}

describe('AsyncViewPluginController', () => {
	const updateAsyncDecorations = jest.fn();
	const cancelPendingUpdates = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
		AsyncViewPluginController.activeControllers.clear();
		(StatefulDecorationSet as unknown as jest.Mock).mockImplementation(() => ({
			updateAsyncDecorations,
			cancelPendingUpdates,
		}));
	});

	test('starts initial decoration computation for the current file', () => {
		const view = createView('Initial.md');

		new AsyncViewPluginController(view as EditorView);

		expect(StatefulDecorationSet).toHaveBeenCalledWith(view);
		expect(updateAsyncDecorations).toHaveBeenCalledWith(view.state, true);
	});

	test('refreshes immediately and cancels pending work when the editor file changes', () => {
		const controller = new AsyncViewPluginController(createView('Old.md') as EditorView);

		jest.clearAllMocks();
		controller.update(createUpdate({ path: 'New.md', docChanged: false }));

		expect(cancelPendingUpdates).toHaveBeenCalledTimes(1);
		expect(updateAsyncDecorations).toHaveBeenCalledWith(expect.anything(), true);
	});

	test('retries initial render when the file path is not ready at construction time', () => {
		jest.useFakeTimers();
		const { view, setPath } = createMutableView(null);

		new AsyncViewPluginController(view as EditorView);
		expect(updateAsyncDecorations).toHaveBeenCalledTimes(1);

		setPath('Recovered.md');
		jest.advanceTimersByTime(121);

		expect(cancelPendingUpdates).toHaveBeenCalledTimes(1);
		expect(updateAsyncDecorations).toHaveBeenCalledTimes(2);
		expect(updateAsyncDecorations).toHaveBeenLastCalledWith(view.state, true);
	});

	test('schedules a stabilization refresh after the initial editor render', () => {
		jest.useFakeTimers();
		const view = createView('Stabilize.md');

		new AsyncViewPluginController(view as EditorView);
		expect(updateAsyncDecorations).toHaveBeenCalledTimes(1);

		jest.advanceTimersByTime(121);

		expect(cancelPendingUpdates).toHaveBeenCalledTimes(1);
		expect(updateAsyncDecorations).toHaveBeenCalledTimes(2);
		expect(updateAsyncDecorations).toHaveBeenLastCalledWith(view.state, true);
	});

	test('refreshes same-file document changes after canceling pending updates', () => {
		const controller = new AsyncViewPluginController(createView('Same.md') as EditorView);

		jest.clearAllMocks();
		controller.update(createUpdate({ path: 'Same.md', docChanged: true }));

		expect(cancelPendingUpdates).toHaveBeenCalledTimes(1);
		expect(updateAsyncDecorations).toHaveBeenCalledWith(expect.anything(), true);
	});

	test('hideInflux and showInflux drive visible state into decoration refreshes', () => {
		const view = createView('Visibility.md');
		const controller = new AsyncViewPluginController(view);

		jest.clearAllMocks();
		controller.hideInflux(view);
		controller.showInflux(view);

		expect(updateAsyncDecorations).toHaveBeenNthCalledWith(1, view.state, false);
		expect(updateAsyncDecorations).toHaveBeenNthCalledWith(2, view.state, true);
	});

	test('destroy cancels debounced refreshes and pending updates', () => {
		const controller = new AsyncViewPluginController(createView('Destroy.md'));

		jest.clearAllMocks();
		controller.update(createUpdate({ path: 'Destroy.md', docChanged: true }));
		controller.destroy();

		expect(cancelPendingUpdates).toHaveBeenCalledTimes(2);
		expect(updateAsyncDecorations).toHaveBeenCalledTimes(1);
	});

	test('refreshAllInfluxEditorViews refreshes every active controller and stops after destroy', () => {
		const first = new AsyncViewPluginController(createView('One.md'));
		const second = new AsyncViewPluginController(createView('Two.md'));

		jest.clearAllMocks();
		refreshAllInfluxEditorViews();
		expect(updateAsyncDecorations).toHaveBeenCalledTimes(2);

		jest.clearAllMocks();
		first.destroy();
		refreshAllInfluxEditorViews();
		expect(updateAsyncDecorations).toHaveBeenCalledTimes(1);

		second.destroy();
	});
});

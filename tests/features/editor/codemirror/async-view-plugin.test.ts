import { editorViewField } from 'obsidian';
import { AsyncViewPluginController } from '@/features/editor/codemirror/async-view-plugin';
import { StatefulDecorationSet } from '@/features/editor/codemirror/stateful-decoration-set';

jest.mock('@/features/editor/codemirror/stateful-decoration-set', () => ({
	StatefulDecorationSet: jest.fn(),
}));

function createView(path: string | null) {
	return {
		state: {
			field: jest.fn((field: unknown) => {
				if (field === editorViewField) {
					return path ? { file: { path } } : null;
				}
				return null;
			}),
		},
	} as any;
}

function createUpdate(params: { path: string | null; docChanged?: boolean }) {
	return {
		view: createView(params.path),
		docChanged: params.docChanged ?? false,
	} as any;
}

describe('AsyncViewPluginController', () => {
	const updateAsyncDecorations = jest.fn();
	const cancelPendingUpdates = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		(StatefulDecorationSet as unknown as jest.Mock).mockImplementation(() => ({
			updateAsyncDecorations,
			cancelPendingUpdates,
		}));
	});

	test('starts initial decoration computation for the current file', () => {
		const view = createView('Initial.md');

		new AsyncViewPluginController(view);

		expect(StatefulDecorationSet).toHaveBeenCalledWith(view);
		expect(updateAsyncDecorations).toHaveBeenCalledWith(view.state, true);
	});

	test('refreshes immediately and cancels pending work when the editor file changes', () => {
		const controller = new AsyncViewPluginController(createView('Old.md'));

		jest.clearAllMocks();
		controller.update(createUpdate({ path: 'New.md', docChanged: false }));

		expect(cancelPendingUpdates).toHaveBeenCalledTimes(1);
		expect(updateAsyncDecorations).toHaveBeenCalledWith(expect.anything(), true);
	});

	test('refreshes same-file document changes after canceling pending updates', () => {
		const controller = new AsyncViewPluginController(createView('Same.md'));

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
});

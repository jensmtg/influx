import { Decoration } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { editorViewField } from 'obsidian';
import { StatefulDecorationSet } from '@/features/editor/codemirror/stateful-decoration-set';
import { statefulDecorations } from '@/features/editor/codemirror/decoration-state';
import InfluxFile from '@/domain/backlinks/influx-file';
import { getPlugin, isPluginUnloading } from '@/platform/obsidian/plugin-window-guards';
import { cacheManager } from '@/platform/cache/cache-manager';

jest.mock('@/domain/backlinks/influx-file', () => ({
	__esModule: true,
	default: {
		create: jest.fn(),
	},
}));

jest.mock('@/platform/obsidian/plugin-window-guards', () => ({
	getPlugin: jest.fn(),
	isPluginUnloading: jest.fn(),
}));

jest.mock('@/platform/diagnostics/metrics', () => ({
	recordMetric: jest.fn(),
}));

jest.mock('@/domain/settings/settings-hash', () => ({
	computeSettingsHash: jest.fn(() => 'test-hash'),
}));

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

function createDoc(text: string) {
	const lines = text.length === 0 ? [''] : text.split('\n');
	return {
		length: text.length,
		lines: lines.length,
		line: (lineNumber: number) => {
			const textBefore = lines.slice(0, lineNumber - 1).join('\n');
			const lineText = lines[lineNumber - 1] ?? '';
			const from = lineNumber === 1 ? 0 : textBefore.length + 1;
			return {
				text: lineText,
				from,
				to: from + lineText.length,
			};
		},
	};
}

function createState(text: string, filePath = 'Test.md'): EditorState {
	const doc = createDoc(text);
	return {
		doc,
		field: jest.fn((field: unknown) => {
			if (field === editorViewField) {
				return {
					file: {
						path: filePath,
						stat: { mtime: 123 },
					},
				};
			}
			if (field === statefulDecorations.field) {
				return Decoration.none;
			}
			return null;
		}),
	} as unknown as EditorState;
}

function createView(state: EditorState) {
	return {
		state,
		dispatch: jest.fn(),
	};
}

function createPlugin(overrides?: Record<string, unknown>) {
	return {
		data: {
			settings: {
				showInfluxInSidebar: false,
				influxAtTopOfPage: false,
				listLimit: 10,
				...overrides,
			},
		},
		api: {},
	};
}

describe('StatefulDecorationSet', () => {
	const getPluginMock = getPlugin as jest.Mock;
	const isPluginUnloadingMock = isPluginUnloading as jest.Mock;
	const createInfluxFileMock = (InfluxFile as { create: jest.Mock }).create;

	beforeEach(() => {
		jest.clearAllMocks();
		cacheManager.clearAll();
		getPluginMock.mockReturnValue(createPlugin());
		isPluginUnloadingMock.mockReturnValue(false);
		createInfluxFileMock.mockResolvedValue({
			show: true,
			makeInfluxList: jest.fn().mockResolvedValue(undefined),
			toEntries: jest.fn().mockReturnValue([{ id: 'entry-1' }]),
			totalEntryCount: 1,
			components: [],
			collapsed: false,
			file: { path: 'Test.md' },
		});
	});

	afterEach(() => {
		cacheManager.clearAll();
	});

	test('applies only the most recent async decoration result after a file switch', async () => {
		const firstState = createState('first file', 'First.md');
		const secondState = createState('second file', 'Second.md');
		const view = createView(secondState);
		const decorationSet = new StatefulDecorationSet(view as any);

		const staleResult = deferred<any>();
		const freshResult = Decoration.none;
		jest
			.spyOn(decorationSet as any, 'computeAsyncDecorationsCoalesced')
			.mockReturnValueOnce(staleResult.promise)
			.mockResolvedValueOnce(freshResult);

		const firstUpdate = decorationSet.updateAsyncDecorations(firstState, true);
		const secondUpdate = decorationSet.updateAsyncDecorations(secondState, true);

		await secondUpdate;
		staleResult.resolve(Decoration.none);
		await firstUpdate;

		expect(view.dispatch).toHaveBeenCalledTimes(1);
	});

	test('bails without dispatch when plugin starts unloading before async work finishes', async () => {
		const state = createState('content', 'Unload.md');
		const view = createView(state);
		const decorationSet = new StatefulDecorationSet(view as any);

		jest.spyOn(decorationSet as any, 'computeAsyncDecorationsCoalesced').mockResolvedValue(Decoration.none);
		isPluginUnloadingMock.mockReturnValueOnce(false).mockReturnValueOnce(true).mockReturnValue(true);

		await decorationSet.updateAsyncDecorations(state, true);

		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('does not dispatch Decoration.none when async compute returns null', async () => {
		const state = createState('content', 'Transient.md');
		const view = createView(state);
		const decorationSet = new StatefulDecorationSet(view as any);

		jest.spyOn(decorationSet as any, 'computeAsyncDecorationsCoalesced').mockResolvedValue(null);

		await decorationSet.updateAsyncDecorations(state, true);

		expect(view.dispatch).not.toHaveBeenCalled();
	});

	test('recomputes after a transient null result instead of caching it', async () => {
		const state = createState('content', 'Retry.md');
		const view = createView(state);
		const decorationSet = new StatefulDecorationSet(view as any);
		const computeSpy = jest.spyOn(decorationSet as any, 'computeAsyncDecorations');

		computeSpy.mockResolvedValueOnce(null).mockResolvedValueOnce(Decoration.none);

		(decorationSet as any).pendingUpdate = { show: true, updateId: 1 };
		const first = await (decorationSet as any).computeAsyncDecorationsCoalesced(state, true, createPlugin(), 1);
		(decorationSet as any).pendingUpdate = { show: true, updateId: 2 };
		const second = await (decorationSet as any).computeAsyncDecorationsCoalesced(state, true, createPlugin(), 2);

		expect(first).toBeNull();
		expect(second).toBe(Decoration.none);
		expect(computeSpy).toHaveBeenCalledTimes(2);
	});

	test('recomputes after dependency invalidation even when file state is unchanged', async () => {
		const state = createState('content', 'Dependency.md');
		const view = createView(state);
		const decorationSet = new StatefulDecorationSet(view as any);
		const computeSpy = jest.spyOn(decorationSet as any, 'computeAsyncDecorations');

		computeSpy.mockResolvedValue(Decoration.none);

		(decorationSet as any).pendingUpdate = { show: true, updateId: 1 };
		const first = await (decorationSet as any).computeAsyncDecorationsCoalesced(state, true, createPlugin(), 1);
		cacheManager.invalidateFile('Source.md');
		(decorationSet as any).pendingUpdate = { show: true, updateId: 2 };
		const second = await (decorationSet as any).computeAsyncDecorationsCoalesced(state, true, createPlugin(), 2);

		expect(first).toBe(Decoration.none);
		expect(second).toBe(Decoration.none);
		expect(computeSpy).toHaveBeenCalledTimes(2);
	});

	test('anchors decorations after closing frontmatter when top-of-page mode is enabled', async () => {
		const text = ['---', 'title: Example', '---', 'Body text'].join('\n');
		const state = createState(text, 'Frontmatter.md');
		const view = createView(state);
		const decorationSet = new StatefulDecorationSet(view as any);
		(decorationSet as any).pendingUpdate = { show: true, updateId: 1 };
		getPluginMock.mockReturnValue(createPlugin({ influxAtTopOfPage: true }));

		const decorations = await decorationSet.computeAsyncDecorations(state, true, 1);
		const ranges: number[] = [];
		decorations?.between(0, state.doc.length, (from: number) => ranges.push(from));

		expect(ranges).toEqual([(state.doc as any).line(3).to]);
	});

	test('anchors decorations at the document end when top-of-page mode is disabled', async () => {
		const text = ['---', 'title: Example', '---', 'Body text'].join('\n');
		const state = createState(text, 'Bottom.md');
		const view = createView(state);
		const decorationSet = new StatefulDecorationSet(view as any);
		(decorationSet as any).pendingUpdate = { show: true, updateId: 1 };

		const decorations = await decorationSet.computeAsyncDecorations(state, true, 1);
		const ranges: number[] = [];
		decorations?.between(0, state.doc.length, (from: number) => ranges.push(from));

		expect(ranges).toEqual([state.doc.length]);
	});
});

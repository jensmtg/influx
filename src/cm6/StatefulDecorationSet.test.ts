/** @jest-environment jsdom */

jest.mock('obsidian', () => ({
    editorViewField: require('@codemirror/state').StateField.define({
        create: () => ({ file: { path: 'Target.md' } }), update: (value: any) => value,
    }),
    Platform: { isMobile: false },
}), { virtual: true });
jest.mock('../InfluxFile', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('./InfluxWidget', () => ({ influxDecoration: jest.fn() }));

import { EditorState } from '@codemirror/state';
import { Decoration } from '@codemirror/view';
import { editorViewField } from 'obsidian';
import { StatefulDecorationSet } from './StatefulDecorationSet';
import { statefulDecorations } from './helpers';

function fixture() {
    const editor = { state: EditorState.create({ doc: 'Note', extensions: [statefulDecorations.field, editorViewField] }), dispatch: jest.fn() };
    return { editor, decorations: new StatefulDecorationSet(editor as any) };
}

test.each(['hide', 'destroy'])('%s cancels an outstanding decoration calculation', async action => {
    const { editor, decorations } = fixture();
    let release!: (value: any) => void;
    const compute = jest.spyOn(decorations, 'computeAsyncDecorations')
        .mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = decorations.updateAsyncDecorations(editor.state, true);
    if (action === 'hide') decorations.hideIfShowing();
    else decorations.destroy();
    release({ decorations: Decoration.set([Decoration.line({}).range(0)]) });
    await pending;
    expect(editor.dispatch).not.toHaveBeenCalled();
    if (action === 'destroy') {
        await decorations.updateAsyncDecorations(editor.state, true);
        expect(compute).toHaveBeenCalledTimes(1);
    }
});

test('handles failed asynchronous calculations without an unhandled rejection', async () => {
    const { editor, decorations } = fixture();
    jest.spyOn(decorations, 'computeAsyncDecorations').mockRejectedValueOnce(new Error('Metadata unavailable'));
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(decorations.updateAsyncDecorations(editor.state, true)).resolves.toBeUndefined();
    expect(editor.dispatch).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
});

test('tracks the backlink graph used to render instead of fetching it twice', async () => {
    const { editor, decorations } = fixture();
    const getBacklinks = jest.fn(async () => ({ data: new Map([['New.md', [{ link: 'Target' }]]]) }));
    (window as any).influxPlugin = { api: { getBacklinks } };
    jest.spyOn(decorations, 'computeAsyncDecorations').mockResolvedValue({
        decorations: Decoration.none, backlinkSourceSignature: 'Old.md',
    });
    await decorations.updateAsyncDecorations(editor.state, true);
    expect(getBacklinks).not.toHaveBeenCalled();
    await expect(decorations.backlinkSourcesChanged()).resolves.toBe(true);
    delete (window as any).influxPlugin;
});

import { EditorState } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';
import {
    createInfluxBlockDecoration,
    getInfluxDecorationPlacement,
    INFLUX_WIDGET_SIDE,
} from './decoration-placement';

class TestWidget extends WidgetType {
    toDOM(): HTMLElement {
        throw new Error('DOM rendering is not needed for this mapping test');
    }
}

describe('Influx decoration placement', () => {
    test('keeps the footer after text typed into a trailing empty bullet', () => {
        const state = EditorState.create({ doc: '- ' });
        const placement = getInfluxDecorationPlacement(state, false);
        const decorations = Decoration.set([
            createInfluxBlockDecoration(
                new TestWidget(),
                placement.side,
            ).range(placement.position),
        ]);

        const transaction = state.update({
            changes: { from: state.doc.length, insert: 'typed' },
        });
        const mapped = decorations.map(transaction.changes);
        const positions: number[] = [];
        mapped.between(0, transaction.state.doc.length, (from) => {
            positions.push(from);
        });

        expect(INFLUX_WIDGET_SIDE).toBeGreaterThan(0);
        expect(positions).toEqual([transaction.state.doc.length]);
    });

    test('places a top widget after frontmatter', () => {
        const state = EditorState.create({
            doc: '---\ntags: [test]\n---\nBody',
        });
        const placement = getInfluxDecorationPlacement(state, true);

        expect(placement.position).toBe(state.doc.line(3).to);
        expect(placement.side).toBe(INFLUX_WIDGET_SIDE);
    });

    test('places a top widget at the start when there is no frontmatter', () => {
        const state = EditorState.create({ doc: 'Body' });

        expect(getInfluxDecorationPlacement(state, true).position).toBe(0);
    });
});

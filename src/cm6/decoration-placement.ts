import type { EditorState } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

export interface InfluxDecorationPlacement {
    position: number;
    side: number;
}

// Positive affinity keeps a footer after text inserted at the end of the note.
export const INFLUX_WIDGET_SIDE = 1;

export function createInfluxBlockDecoration(
    widget: WidgetType,
    side = INFLUX_WIDGET_SIDE,
): Decoration {
    return Decoration.widget({
        widget,
        side,
        block: true,
    });
}

export function getInfluxDecorationPlacement(
    state: EditorState,
    influxAtTopOfPage: boolean,
): InfluxDecorationPlacement {
    if (!influxAtTopOfPage) {
        return {
            position: state.doc.length,
            side: INFLUX_WIDGET_SIDE,
        };
    }

    return {
        position: findPositionAfterFrontmatter(state),
        side: INFLUX_WIDGET_SIDE,
    };
}

function findPositionAfterFrontmatter(state: EditorState): number {
    const doc = state.doc;
    const firstLine = doc.line(1);
    if (firstLine.text.trim() !== '---') {
        return 0;
    }

    for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber++) {
        const line = doc.line(lineNumber);
        if (line.text.trim() === '---') {
            return line.to;
        }
    }

    return 0;
}

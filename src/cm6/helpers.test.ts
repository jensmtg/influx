import { EditorState } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import {
    INFLUX_EDITOR_CLASS,
    statefulDecorations,
} from "./helpers";

function editorClasses(state: EditorState): string[] {
    return state.facet(EditorView.editorAttributes)
        .flatMap(attributes => (
            typeof attributes === "function"
                ? []
                : attributes.class?.split(/\s+/).filter(Boolean) ?? []
        ));
}

describe("stateful Influx decorations", () => {
    test("ties the editor class to decoration state", () => {
        const initialState = EditorState.create({
            doc: "Note",
            extensions: [statefulDecorations.field],
        });

        expect(editorClasses(initialState)).not.toContain(INFLUX_EDITOR_CLASS);

        const withWidget = initialState.update({
            effects: statefulDecorations.update.of(Decoration.set([
                Decoration.line({}).range(0),
            ])),
        }).state;

        expect(editorClasses(withWidget)).toContain(INFLUX_EDITOR_CLASS);

        const withoutWidget = withWidget.update({
            effects: statefulDecorations.update.of(Decoration.none),
        }).state;

        expect(editorClasses(withoutWidget)).not.toContain(INFLUX_EDITOR_CLASS);
    });
});

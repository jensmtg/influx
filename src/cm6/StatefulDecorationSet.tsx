import { debounce, editorViewField } from "obsidian";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { Range } from "@codemirror/rangeset";
import InfluxFile from '../InfluxFile';
import { ApiAdapter } from '../apiAdapter';
import { influxDecoration } from "./InfluxWidget";
import { statefulDecorations } from "./helpers";


export class StatefulDecorationSet {
    editor: EditorView;
    decoCache: { [cls: string]: Decoration } = Object.create(null);

    constructor(editor: EditorView) {
        this.editor = editor;
    }

    async computeAsyncDecorations(state: EditorState): Promise<DecorationSet | null> {

        const { app, file } = state.field(editorViewField);
        const apiAdapter = new ApiAdapter(app)
        const influxFile = new InfluxFile(file.path, apiAdapter)
        await influxFile.makeInfluxList()
        await influxFile.renderAllMarkdownBlocks()

        const decorations: Range<Decoration>[] = []
        decorations.push(influxDecoration({ influxFile }).range(state.doc.length))
        return Decoration.set(decorations, true);

    }

    debouncedUpdate = debounce(this.updateAsyncDecorations, 100, true);

    async updateAsyncDecorations(state: EditorState): Promise<void> {
        const decorations = await this.computeAsyncDecorations(state);
        // if our compute function returned nothing and the state field still has decorations, clear them out
        if (decorations || this.editor.state.field(statefulDecorations.field).size) {
            this.editor.dispatch({ effects: statefulDecorations.update.of(decorations || Decoration.none) });
        }
    }
}
import { editorViewField } from "obsidian";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
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

    async computeAsyncDecorations(state: EditorState, show: boolean): Promise<DecorationSet | null> {
        if (!state.field(editorViewField)) return null; // If not yet loaded.

        const { app, file } = state.field(editorViewField);
        if (!file) return null; // If no file is loaded
        
        const apiAdapter = new ApiAdapter(app)
        // @ts-ignore
        const influxFile = new InfluxFile(file.path, apiAdapter, app.plugins.plugins.influx)
        await influxFile.makeInfluxList()
        await influxFile.renderAllMarkdownBlocks()

        const decorations: Range<Decoration>[] = []
        if (show && influxFile.show) {
            decorations.push(influxDecoration({ influxFile, show: influxFile.show }).range(state.doc.length))

        }
        return Decoration.set(decorations, true);

    }


    async updateAsyncDecorations(state: EditorState, show: boolean): Promise<void> {
        const decorations = await this.computeAsyncDecorations(state, show);
        // if our compute function returned nothing and the state field still has decorations, clear them out
        if (decorations || this.editor.state.field(statefulDecorations.field).size) {
            this.editor.dispatch({ effects: statefulDecorations.update.of(decorations || Decoration.none) });
        }
    }
}
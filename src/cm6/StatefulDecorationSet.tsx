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
        const plugin = app.plugins?.plugins?.influx
        if (!plugin) return null; // If plugin not loaded
        
        const influxFile = new InfluxFile(file.path, apiAdapter, plugin)
        await influxFile.makeInfluxList()
        await influxFile.renderAllMarkdownBlocks()

        const decorations: Range<Decoration>[] = []
        if (show && influxFile.show) {
            const settings = influxFile.influx.data.settings;

            // Determine anchor position based on influxAtTopOfPage setting
            let anchorPosition: number;
            let side: number;

            if (settings.influxAtTopOfPage) {
                // Show at top of page (before content)
                // Try to find position after frontmatter (if exists)
                anchorPosition = this.findPositionAfterFrontmatter(state);
                side = 1; // After the position (places it at the start of the content)
            } else {
                // Show at bottom of page (after all content)
                anchorPosition = state.doc.length;
                side = -1; // Before the position (places it at the end of the content)
            }

            decorations.push(influxDecoration({ influxFile, show: influxFile.show, side }).range(anchorPosition))
        }
        return Decoration.set(decorations, true);

    }

    private findPositionAfterFrontmatter(state: EditorState): number {
        const lines = state.doc.toString().split('\n');

        // Check if document starts with frontmatter (---)
        if (lines.length > 0 && lines[0].trim() === '---') {
            // Find the closing ---
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '---') {
                    // Return position after the closing --- and newline
                    let pos = 0;
                    for (let j = 0; j <= i; j++) {
                        pos += lines[j].length + 1; // +1 for newline
                    }
                    return pos;
                }
            }
        }

        // No frontmatter found, return 0 (start of document)
        return 0;
    }


    async updateAsyncDecorations(state: EditorState, show: boolean): Promise<void> {
        const decorations = await this.computeAsyncDecorations(state, show);
        // if our compute function returned nothing and the state field still has decorations, clear them out
        if (decorations || this.editor.state.field(statefulDecorations.field).size) {
            this.editor.dispatch({ effects: statefulDecorations.update.of(decorations || Decoration.none) });
        }
    }
}
import { editorViewField } from "obsidian";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
import InfluxFile from '../InfluxFile';
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

        const { file } = state.field(editorViewField);
        if (!file) return null; // If no file is loaded

        // Access plugin through global window reference since app.plugins doesn't work in CodeMirror context
        const plugin = (window as any).influxPlugin

        if (!plugin) {
            return null;
        }

        // Reuse plugin's api instance instead of creating new one (preserves cache)
        const apiAdapter = plugin.api

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
        const doc = state.doc;

        // Check if document has at least one line and starts with frontmatter
        if (doc.lines < 1) return 0;

        const firstLine = doc.line(1);
        if (firstLine.text.trim() !== '---') return 0;

        // Scan lines without converting entire doc to string - O(n) instead of O(n²)
        for (let i = 2; i <= doc.lines; i++) {
            const line = doc.line(i);
            if (line.text.trim() === '---') {
                return line.to; // Position after closing ---
            }
        }

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
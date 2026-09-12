import { editorViewField, Platform } from "obsidian";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
import InfluxFile from '../InfluxFile';
import { influxDecoration } from "./InfluxWidget";
import { statefulDecorations } from "./helpers";
import { getBacklinkSourceSignature } from "../backlink-utils";
import { getInfluxDecorationPlacement } from "./decoration-placement";
import {
	findInfluxWidgetPosition,
	shouldSuppressInfluxForTableEditing,
} from "./placement-utils";

type DecorationResult = {
    decorations: DecorationSet;
    backlinkSourceSignature?: string;
};

export class StatefulDecorationSet {
    editor: EditorView;
    decoCache: { [cls: string]: Decoration } = Object.create(null);
    private requestGeneration = 0;
    private backlinkSourceSignature = '';
    private showingDecorations = false;
    private destroyed = false;

    constructor(editor: EditorView) {
        this.editor = editor;
    }

    async computeAsyncDecorations(state: EditorState, show: boolean): Promise<DecorationResult | null> {
        const editorField = state.field(editorViewField, false)
        if (!editorField) return null; // If not yet loaded.

        // Desktop editors can safely render beside tables. Mobile temporarily
        // hides the block only while the caret is inside an actual table.
        if (Platform.isMobile && shouldSuppressInfluxForTableEditing(state)) {
            return { decorations: Decoration.none };
        }


        const { file } = editorField;
        if (!file) return null; // If no file is loaded

        // Access plugin through global window reference since app.plugins doesn't work in CodeMirror context
        const plugin = (window as any).influxPlugin

        if (!plugin) {
            return null;
        }

        // Reuse plugin's api instance instead of creating new one (preserves cache)
        const apiAdapter = plugin.api

        const influxFile = await InfluxFile.create(file.path, apiAdapter, plugin)
        const backlinkSourceSignature = getBacklinkSourceSignature(influxFile.backlinks)

        // Avoid a block widget unless there are results or the user explicitly
        // enabled the empty Influx section.
        if (!show || !influxFile.show) {
            return { decorations: Decoration.none, backlinkSourceSignature }
        }

        const hasVisibleEntries = await influxFile.prepare()
        if (!hasVisibleEntries) {
            return { decorations: Decoration.none, backlinkSourceSignature }
        }

        const decorations: Range<Decoration>[] = []
        const placement = getInfluxDecorationPlacement(
            state,
            influxFile.influx.data.settings.influxAtTopOfPage,
        )
        // rudironsoni's fix: skip over a leading table/heading-table when anchoring
        // at the top of the page so backlinks never land inside a table cell.
        const position = influxFile.influx.data.settings.influxAtTopOfPage && hasVisibleEntries
            ? Math.max(placement.position, findInfluxWidgetPosition(state))
            : placement.position
        decorations.push(influxDecoration({
            influxFile,
            show: show && influxFile.show,
            side: placement.side,
        }).range(position))

        return { decorations: Decoration.set(decorations, true), backlinkSourceSignature };

    }

    /** Check whether incoming sources changed without doing excerpt/render work. */
    async backlinkSourcesChanged(): Promise<boolean> {
        const editorField = this.editor.state.field(editorViewField, false)
        const plugin = (window as any).influxPlugin
        if (!editorField?.file || !plugin) {
            return false
        }

        const backlinks = await plugin.api.getBacklinks(editorField.file)
        return getBacklinkSourceSignature(backlinks) !== this.backlinkSourceSignature
    }

    async updateAsyncDecorations(state: EditorState, show: boolean): Promise<void> {
        if (this.destroyed) return;
        const requestGeneration = ++this.requestGeneration
        const sourceDocument = state.doc
        const sourceFilePath = state.field(editorViewField, false)?.file?.path
        let result: DecorationResult | null;
        try {
            result = await this.computeAsyncDecorations(state, show);
        } catch (error) {
            if (!this.destroyed && requestGeneration === this.requestGeneration) {
                console.error('[Influx] Failed to refresh editor:', error);
            }
            return;
        }

        // Check if editor is still valid before proceeding
        if (!this.editor || !this.editor.state) {
            return;
        }

        const currentFilePath = this.editor.state.field(editorViewField, false)?.file?.path
        if (
            requestGeneration !== this.requestGeneration ||
            sourceDocument !== this.editor.state.doc ||
            sourceFilePath !== currentFilePath
        ) {
            return;
        }

        // Save the graph that produced these cards, not a newer graph loaded
        // afterwards. This also avoids a second vault scan for empty results.
        const decorations = result?.decorations ?? null;
        if (result?.backlinkSourceSignature !== undefined) {
            this.backlinkSourceSignature = result.backlinkSourceSignature;
        }

        // Safely check if we need to update decorations
        let hasExistingDecorations = false;
        try {
            hasExistingDecorations = this.editor.state.field(statefulDecorations.field).size > 0;
        } catch {
            // Field is not present in state (view being destroyed, plugin unloaded, etc.)
            // If we have new decorations, try to apply them. Otherwise, silently exit.
            if (decorations) {
                try {
                    this.editor.dispatch({ effects: statefulDecorations.update.of(decorations) });
                    this.showingDecorations = decorations.size > 0;
                } catch {
                    // Dispatch failed - editor is being destroyed, ignore
                }
            }
            return;
        }

        // Update decorations if we have new ones or need to clear existing ones
        if (decorations || hasExistingDecorations) {
            try {
                this.editor.dispatch({ effects: statefulDecorations.update.of(decorations || Decoration.none) });
                this.showingDecorations = Boolean(decorations && decorations.size > 0);
            } catch {
                // Dispatch failed - editor is being destroyed, ignore
            }
        }
    }

    /**
     * Synchronously drop a visible influx widget without waiting for an async
     * recomputation. Used on mobile while the user is editing inside a markdown
     * table: deferring to the debounced path means the block widget can be
     * inserted/removed mid-composition while the virtual keyboard is open, which
     * forces a re-measure and glitches scroll position away from the caret.
     */
    hideIfShowing(): void {
        // A pending computation must not restore a widget while typing in a table.
        this.requestGeneration++;
        if (!this.showingDecorations) {
            return;
        }
        this.showingDecorations = false;
        try {
            this.editor.dispatch({ effects: statefulDecorations.update.of(Decoration.none) });
        } catch {
            // Dispatch failed - editor is being destroyed or mid-update, ignore
        }
    }

    destroy(): void {
        // Supersede any asynchronous calculation that is still in flight.
        this.requestGeneration++
        this.destroyed = true;
    }
}

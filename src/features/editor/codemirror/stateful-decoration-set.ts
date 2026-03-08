import { editorViewField } from "obsidian";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
import { influxDecoration } from "./influx-widget";
import { statefulDecorations } from "./decoration-state";
import { getPlugin, isPluginUnloading } from '../../../platform/obsidian/plugin-window-guards';
import type { MinimalPluginInterface } from '../../../platform/obsidian/plugin-window-guards';
import { ApiAdapter } from '../../../domain/backlinks/api-adapter';
import type ObsidianInflux from '../../../app/influx-plugin';
import { createInfluxFileForRender } from '../../../domain/backlinks/influx-render-pipeline';
import { StatefulDecorationAsyncState } from './stateful-decoration-async-state';


export class StatefulDecorationSet {
	editor: EditorView;
	private asyncState = new StatefulDecorationAsyncState();

	constructor(editor: EditorView) {
		this.editor = editor;
	}

	async computeAsyncDecorations(state: EditorState, show: boolean, updateId: number): Promise<DecorationSet | null> {
		const editorField = state.field(editorViewField, false);
		if (!editorField) {
			return null;
		}
		if (!show) {
			return Decoration.none;
		}
		if (!this.isUpdateCurrent(updateId, show)) {
			return null;
		}

		const { file } = editorField;
		if (!file) {
			return null;
		}

        // Use type-safe plugin access
		const plugin = getPlugin();

		if (!plugin) {
			return null;
		}

        // Skip inline rendering when sidebar mode is enabled
		const settings = plugin.data.settings;
		if (settings.showInfluxInSidebar) {
			return null;
		}

        // Reuse plugin's api instance instead of creating new one (preserves cache)
        const apiAdapter = plugin.api as ApiAdapter

        const result = await createInfluxFileForRender({
			filePath: file.path,
			api: apiAdapter,
			mode: 'editor',
			settings,
			shouldAbort: () => !this.isUpdateCurrent(updateId, show),
		})
		if (!result) {
			return null;
		}
		const { influxFile } = result
		if (result.hidden) {
			return Decoration.none;
		}

        const decorations: Range<Decoration>[] = []

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

		decorations.push(influxDecoration({ influxFile, show: influxFile.show, plugin: plugin as unknown as ObsidianInflux, side }).range(anchorPosition))

		return Decoration.set(decorations, true);

    }

    private findPositionAfterFrontmatter(state: EditorState): number {
        const doc = state.doc;

        // Check if document has at least one line and starts with frontmatter
        if (doc.lines === 0) return 0;

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

    /**
     * Update decorations asynchronously and dispatch via proper CM6 transaction system
     * This method computes decorations and then dispatches with an update effect
     * to ensure the update happens within CM6's transaction cycle
     */
	async updateAsyncDecorations(state: EditorState, show: boolean): Promise<void> {
		// Capture plugin reference and check at the START to prevent race conditions
		const plugin = getPlugin();
		if (!plugin || isPluginUnloading()) {
			return;
		}

        // Store editor reference and check immediately
		if (!this.editor) {
			return;
		}

        // Store pending request for cancellation
        const request = this.asyncState.beginUpdate(show);
        const currentUpdateId = request.updateId;

        // Compute decorations using the state at call time.
        // Coalesce duplicate in-flight builds for the same file/state/settings.
        const decorations = await this.computeAsyncDecorationsCoalesced(state, show, plugin, currentUpdateId);

        // Early exit if plugin or editor was destroyed during async computation
        // This prevents updating a destroyed editor
		if (!this.editor || !this.editor.state) {
			this.asyncState.clearPending();
			return;
		}

        // Check if this update is still the most recent request
		if (!this.asyncState.isLatestRequest(show, currentUpdateId)) {
			this.asyncState.clearPending();
			return;
		}

        // Revalidate plugin instance still active (after async operation)
        const currentPlugin = getPlugin();
		if (currentPlugin !== plugin) {
			this.asyncState.clearPending();
			return;
		}

        // Check if plugin is now unloading (after async operation)
		if (isPluginUnloading()) {
			this.asyncState.clearPending();
			return;
		}

		// Final check before updating decorations - ensure plugin still active and editor valid
		if (isPluginUnloading() || !this.editor || !this.editor.state) {
			this.asyncState.clearPending();
			return;
		}

		if (decorations === null) {
			this.asyncState.clearPending();
			return;
		}

		const decorationField = this.editor.state.field(statefulDecorations.field, false);
		if (decorationField) {
			try {
				this.editor.dispatch({
					effects: [statefulDecorations.update.of(decorations)]
				});
			} catch {
				// Log error but don't throw - editor may have been destroyed during async computation
				// This is expected when switching files rapidly
			}
		}

        this.asyncState.clearPending();
    }

    /**
     * Cancel any pending async decoration updates
     * Call this when you know the editor state will change soon
     */
    cancelPendingUpdates(): void {
        this.asyncState.clearPending();
    }

    private isUpdateCurrent(updateId: number, show: boolean): boolean {
        return this.asyncState.isUpdateCurrent(updateId, show);
    }

    private async computeAsyncDecorationsCoalesced(
        state: EditorState,
        show: boolean,
        plugin: MinimalPluginInterface,
        updateId: number
    ): Promise<DecorationSet | null> {
        return await this.asyncState.getCoalescedDecorations({
			state,
			show,
			plugin,
			compute: () => this.computeAsyncDecorations(state, show, updateId),
		});
    }

	set pendingUpdate(value: { show: boolean; updateId: number } | null) {
		this.asyncState.setPendingForTests(value);
	}

	get pendingUpdate(): { show: boolean; updateId: number } | null {
		return this.asyncState.getPendingForTests();
	}
}

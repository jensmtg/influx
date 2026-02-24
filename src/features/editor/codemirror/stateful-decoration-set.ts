import { editorViewField } from "obsidian";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
import InfluxFile from '../../../domain/backlinks/influx-file';
import { influxDecoration } from "./influx-widget";
import { statefulDecorations } from "./decoration-state";
import { getPlugin, isPluginUnloading } from '../../../platform/obsidian/plugin-window-guards';
import type { MinimalPluginInterface } from '../../../platform/obsidian/plugin-window-guards';
import { ApiAdapter } from '../../../domain/backlinks/api-adapter';
import type ObsidianInflux from '../../../app/InfluxPlugin';
import { recordMetric } from '../../../platform/diagnostics/metrics';
import { computeSettingsHash } from '../../../domain/settings/settings-hash';


export class StatefulDecorationSet {
    private static readonly RECENT_COMPUTE_TTL_MS = 5000;

    editor: EditorView;
    decoCache: { [cls: string]: Decoration } = Object.create(null);
    pendingUpdate: { show: boolean; updateId: number } | null = null;
    private updateId: number = 0;
    private inflightComputation: { key: string; promise: Promise<DecorationSet | null> } | null = null;
    private recentComputation: { key: string; decorations: DecorationSet | null; timestamp: number } | null = null;

    constructor(editor: EditorView) {
        this.editor = editor;
    }

    async computeAsyncDecorations(state: EditorState, show: boolean, updateId: number): Promise<DecorationSet | null> {
        if (!state.field(editorViewField)) return null; // If not yet loaded.
        if (!show) return Decoration.none;
        if (!this.isUpdateCurrent(updateId, show)) return null;

        const { file } = state.field(editorViewField);
        if (!file) return null; // If no file is loaded

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
        const pipelineStart = performance.now();

        const influxFile = await InfluxFile.create(file.path, apiAdapter)
        if (!this.isUpdateCurrent(updateId, show)) {
            return null;
        }
        if (!influxFile.show) {
            recordMetric({
                name: 'influx.pipeline.total',
                mode: 'editor',
                durationMs: performance.now() - pipelineStart,
                settings,
                always: true,
                ctx: {
                    filePath: file.path,
                    show: false,
                    listLimit: settings.listLimit || 0,
                    totalEntryCount: 0,
                    renderedCount: 0,
                }
            });
            return Decoration.none;
        }

        await influxFile.makeInfluxList()
        if (!this.isUpdateCurrent(updateId, show)) {
            return null;
        }
        const renderedComponents = influxFile.toEntries()
        if (!this.isUpdateCurrent(updateId, show)) {
            return null;
        }
        recordMetric({
            name: 'influx.pipeline.total',
            mode: 'editor',
            durationMs: performance.now() - pipelineStart,
            settings,
            always: true,
            ctx: {
                filePath: file.path,
                show: influxFile.show,
                listLimit: settings.listLimit || 0,
                totalEntryCount: influxFile.totalEntryCount,
                renderedCount: renderedComponents.length,
            }
        });

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
        const currentUpdateId = ++this.updateId;
        this.pendingUpdate = { show, updateId: currentUpdateId };

        // Compute decorations using the state at call time.
        // Coalesce duplicate in-flight builds for the same file/state/settings.
        const decorations = await this.computeAsyncDecorationsCoalesced(state, show, plugin, currentUpdateId);

        // Early exit if plugin or editor was destroyed during async computation
        // This prevents updating a destroyed editor
        if (!this.editor || !this.editor.state) {
            this.pendingUpdate = null;
            return;
        }

        // Check if this update is still the most recent request
        if (this.pendingUpdate?.show !== show || this.pendingUpdate?.updateId !== currentUpdateId) {
            this.pendingUpdate = null;
            return;
        }

        // Revalidate plugin instance still active (after async operation)
        const currentPlugin = getPlugin();
        if (currentPlugin !== plugin) {
            this.pendingUpdate = null;
            return;
        }

        // Check if plugin is now unloading (after async operation)
        if (isPluginUnloading()) {
            this.pendingUpdate = null;
            return;
        }

        // Final check before updating decorations - ensure plugin still active and editor valid
        if (isPluginUnloading() || !this.editor || !this.editor.state) {
            this.pendingUpdate = null;
            return;
        }

        // Update decorations using proper CM6 StateEffect
        // This ensures update happens within transaction system
        if (this.editor.state.field(statefulDecorations.field, false)) {
            try {
                this.editor.dispatch({
                    effects: [statefulDecorations.update.of(decorations || Decoration.none)]
                });
            } catch {
                // Log error but don't throw - editor may have been destroyed during async computation
                // This is expected when switching files rapidly
            }
        }

        this.pendingUpdate = null;
    }

    /**
     * Cancel any pending async decoration updates
     * Call this when you know the editor state will change soon
     */
    cancelPendingUpdates(): void {
        this.pendingUpdate = null;
    }

    private isUpdateCurrent(updateId: number, show: boolean): boolean {
        return this.pendingUpdate?.updateId === updateId && this.pendingUpdate?.show === show;
    }

    private makeComputationKey(state: EditorState, show: boolean, plugin: MinimalPluginInterface): string {
        const field = state.field(editorViewField, false);
        const filePath = field?.file?.path ?? '';
        const fileMtime = field?.file?.stat?.mtime ?? 0;
        const settingsHash = computeSettingsHash(plugin.data.settings);
        return `${filePath}|${fileMtime}|${show ? 1 : 0}|${settingsHash}`;
    }

    private async computeAsyncDecorationsCoalesced(
        state: EditorState,
        show: boolean,
        plugin: MinimalPluginInterface,
        updateId: number
    ): Promise<DecorationSet | null> {
        const key = this.makeComputationKey(state, show, plugin);
        const recent = this.recentComputation;
        if (recent && recent.key === key && Date.now() - recent.timestamp <= StatefulDecorationSet.RECENT_COMPUTE_TTL_MS) {
            return recent.decorations;
        }

        const inflight = this.inflightComputation;
        if (inflight && inflight.key === key) {
            return await inflight.promise;
        }

        const promise = this.computeAsyncDecorations(state, show, updateId);
        this.inflightComputation = { key, promise };

        try {
            const decorations = await promise;
            this.recentComputation = {
                key,
                decorations,
                timestamp: Date.now(),
            };
            return decorations;
        } finally {
            if (this.inflightComputation?.key === key) {
                this.inflightComputation = null;
            }
        }
    }
}

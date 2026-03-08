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

		const plugin = getPlugin();
		if (!plugin) {
			return null;
		}

		const settings = plugin.data.settings;
		if (settings.showInfluxInSidebar) {
			return null;
		}

		const apiAdapter = plugin.api as ApiAdapter;

		const result = await createInfluxFileForRender({
			filePath: file.path,
			api: apiAdapter,
			mode: 'editor',
			settings,
			shouldAbort: () => !this.isUpdateCurrent(updateId, show),
		});
		if (!result) {
			return null;
		}
		const { influxFile } = result;
		if (result.hidden) {
			return Decoration.none;
		}

		const decorations: Range<Decoration>[] = [];
		const anchorPosition = settings.influxAtTopOfPage
			? this.findPositionAfterFrontmatter(state)
			: state.doc.length;
		const side = settings.influxAtTopOfPage ? 1 : -1;

		decorations.push(
			influxDecoration({
				influxFile,
				show: influxFile.show,
				plugin: plugin as unknown as ObsidianInflux,
				side,
			}).range(anchorPosition)
		);

		return Decoration.set(decorations, true);
	}

	private findPositionAfterFrontmatter(state: EditorState): number {
		const doc = state.doc;

		if (doc.lines === 0) return 0;

		const firstLine = doc.line(1);
		if (firstLine.text.trim() !== '---') return 0;

		for (let i = 2; i <= doc.lines; i++) {
			const line = doc.line(i);
			if (line.text.trim() === '---') {
				return line.to;
			}
		}

		return 0;
	}

	async updateAsyncDecorations(state: EditorState, show: boolean): Promise<void> {
		const plugin = getPlugin();
		if (!plugin || isPluginUnloading()) {
			return;
		}

		if (!this.editor) {
			return;
		}

		const request = this.asyncState.beginUpdate(show);
		const currentUpdateId = request.updateId;

		const decorations = await this.computeAsyncDecorationsCoalesced(state, show, plugin, currentUpdateId);

		if (!this.editor || !this.editor.state) {
			this.asyncState.clearPending();
			return;
		}

		if (!this.asyncState.isLatestRequest(show, currentUpdateId)) {
			this.asyncState.clearPending();
			return;
		}

		const currentPlugin = getPlugin();
		if (currentPlugin !== plugin) {
			this.asyncState.clearPending();
			return;
		}

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
					effects: [statefulDecorations.update.of(decorations)],
				});
			} catch {
			}
		}

		this.asyncState.clearPending();
	}

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

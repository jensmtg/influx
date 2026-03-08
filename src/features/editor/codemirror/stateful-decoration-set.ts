import { editorViewField } from "obsidian";
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, Range } from "@codemirror/state";
import { influxDecoration } from "./influx-widget";
import { statefulDecorations } from "./decoration-state";
import { getPlugin, isPluginUnloading } from '../../../platform/obsidian/plugin-window-guards';
import type { MinimalPluginInterface } from '../../../platform/obsidian/plugin-window-guards';
import { ApiAdapter } from '../../../domain/backlinks/api-adapter';
import { createInfluxFileForRender } from '../../../domain/backlinks/influx-render-pipeline';
import { StatefulDecorationAsyncState } from './stateful-decoration-async-state';
import { isInfluxUiPlugin } from '../../../ui/influx-ui-plugin';


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
		if (!isInfluxUiPlugin(plugin) || !(plugin.api instanceof ApiAdapter)) {
			return null;
		}

		const settings = plugin.data.settings;
		if (settings.showInfluxInSidebar) {
			return null;
		}

		const apiAdapter = plugin.api;
		const computationKey = this.asyncState.getComputationKey(state, show, plugin);

		const result = await createInfluxFileForRender({
			filePath: file.path,
			api: apiAdapter,
			mode: 'editor',
			settings,
			shouldAbort: () => !this.isComputationStillRelevant(computationKey, show, plugin),
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
				plugin,
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
			this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
			return;
		}

		if (!this.asyncState.isLatestRequest(show, currentUpdateId)) {
			this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
			return;
		}

		const currentPlugin = getPlugin();
		if (currentPlugin !== plugin) {
			this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
			return;
		}

		if (isPluginUnloading()) {
			this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
			return;
		}

		// Final check before updating decorations - ensure plugin still active and editor valid
		if (isPluginUnloading() || !this.editor || !this.editor.state) {
			this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
			return;
		}

		if (decorations === null) {
			this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
			return;
		}

		const decorationField = this.editor.state.field(statefulDecorations.field, false);
		if (decorationField) {
			try {
				this.editor.dispatch({
					effects: [statefulDecorations.update.of(decorations)],
				});
			} catch {
				this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
				return;
			}
		}

		this.asyncState.clearPendingIfCurrent(show, currentUpdateId);
	}

	cancelPendingUpdates(): void {
		this.asyncState.clearPending();
	}

	invalidateRecentDecorations(): void {
		this.asyncState.clearRecentComputation();
	}

	private isUpdateCurrent(updateId: number, show: boolean): boolean {
		return this.asyncState.isUpdateCurrent(updateId, show);
	}

	private isComputationStillRelevant(key: string, show: boolean, plugin: MinimalPluginInterface): boolean {
		if (!this.editor || !this.editor.state) {
			return false;
		}

		if (isPluginUnloading()) {
			return false;
		}

		const currentPlugin = getPlugin();
		if (currentPlugin !== plugin) {
			return false;
		}

		return this.asyncState.matchesComputationKey(key, this.editor.state, show, plugin);
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

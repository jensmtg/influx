import type { EditorState } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { computeSettingsHash } from '../../../domain/settings/settings-hash';
import { editorViewField } from 'obsidian';
import type { MinimalPluginInterface } from '../../../platform/obsidian/plugin-window-guards';

interface PendingUpdate {
	show: boolean;
	updateId: number;
}

interface InflightComputation {
	key: string;
	promise: Promise<DecorationSet | null>;
}

interface RecentComputation {
	key: string;
	decorations: DecorationSet;
	timestamp: number;
}

export class StatefulDecorationAsyncState {
	private static readonly RECENT_COMPUTE_TTL_MS = 5000;

	private updateId = 0;
	private pendingUpdate: PendingUpdate | null = null;
	private inflightComputation: InflightComputation | null = null;
	private recentComputation: RecentComputation | null = null;

	beginUpdate(show: boolean): PendingUpdate {
		const request = { show, updateId: ++this.updateId };
		this.pendingUpdate = request;
		return request;
	}

	clearPending(): void {
		this.pendingUpdate = null;
	}

	setPendingForTests(request: PendingUpdate | null): void {
		this.pendingUpdate = request;
	}

	getPendingForTests(): PendingUpdate | null {
		return this.pendingUpdate;
	}

	isUpdateCurrent(updateId: number, show: boolean): boolean {
		return this.pendingUpdate?.updateId === updateId && this.pendingUpdate?.show === show;
	}

	isLatestRequest(show: boolean, updateId: number): boolean {
		return this.pendingUpdate?.show === show && this.pendingUpdate?.updateId === updateId;
	}

	async getCoalescedDecorations(params: {
		state: EditorState;
		show: boolean;
		plugin: MinimalPluginInterface;
		compute: () => Promise<DecorationSet | null>;
	}): Promise<DecorationSet | null> {
		const { state, show, plugin, compute } = params;
		const key = this.makeComputationKey(state, show, plugin);
		const recent = this.recentComputation;
		if (recent && recent.key === key && Date.now() - recent.timestamp <= StatefulDecorationAsyncState.RECENT_COMPUTE_TTL_MS) {
			return recent.decorations;
		}

		const inflight = this.inflightComputation;
		if (inflight && inflight.key === key) {
			return await inflight.promise;
		}

		const promise = compute();
		this.inflightComputation = { key, promise };

		try {
			const decorations = await promise;
			if (decorations !== null) {
				this.recentComputation = {
					key,
					decorations,
					timestamp: Date.now(),
				};
			}
			return decorations;
		} finally {
			if (this.inflightComputation?.key === key) {
				this.inflightComputation = null;
			}
		}
	}

	private makeComputationKey(state: EditorState, show: boolean, plugin: MinimalPluginInterface): string {
		const field = state.field(editorViewField, false);
		const filePath = field?.file?.path ?? '';
		const fileMtime = field?.file?.stat?.mtime ?? 0;
		const settingsHash = computeSettingsHash(plugin.data.settings);
		return `${filePath}|${fileMtime}|${show ? 1 : 0}|${settingsHash}`;
	}
}

import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./stateful-decoration-set";
import { statefulDecorations } from "./decoration-state";
import { debounce, editorViewField } from "obsidian";
import { CONSTANTS } from '../../../config/constants';


export class AsyncViewPluginController {
	static activeControllers = new Set<AsyncViewPluginController>();
	private static readonly INITIAL_STABILIZATION_DELAYS_MS = [120, 360];

    statefulDecorationsSet: StatefulDecorationSet;
    private show: boolean = true;
    private currentFilePath: string | null = null;
    private view: EditorView;
	private initialRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	private initialRefreshAttempt = 0;

    constructor(view: EditorView) {
        this.view = view;
        this.statefulDecorationsSet = new StatefulDecorationSet(view);
        this.currentFilePath = this.getCurrentFilePath(view);
        AsyncViewPluginController.activeControllers.add(this);
        this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
		this.scheduleInitialRefreshIfNeeded();
    }

	refreshNow(): void {
		this.statefulDecorationsSet.cancelPendingUpdates();
		this.debouncedRefresh?.cancel?.();
		this.clearInitialRefreshTimer();
		this.initialRefreshAttempt = 0;
		this.statefulDecorationsSet.updateAsyncDecorations(this.view.state, this.show);
	}

    hideInflux(view: EditorView) {
        this.show = false;
        this.statefulDecorationsSet.updateAsyncDecorations(view.state, false);
    }

    showInflux(view: EditorView) {
        this.show = true;
        this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
     }

	    update(update: ViewUpdate) {
			const newFilePath = this.getCurrentFilePath(update.view);
			const fileChanged = newFilePath !== this.currentFilePath;
			this.currentFilePath = newFilePath;

			if (fileChanged) {
				this.statefulDecorationsSet.cancelPendingUpdates();
				this.debouncedRefresh?.cancel?.();
				this.clearInitialRefreshTimer();
				this.initialRefreshAttempt = 0;
				this.statefulDecorationsSet.updateAsyncDecorations(update.view.state, this.show);
				this.scheduleInitialRefreshIfNeeded();
				return;
			}

			/** Only changes within the same host document flow to this diffing point.
			 * Changes to title of document is not caught.
			 * Changes to other documents that are referenced in influx of host file are not caught.
			 */
			if (update.docChanged) {
				// Cancel any pending updates before scheduling new ones
				this.statefulDecorationsSet.cancelPendingUpdates();
				this.debouncedRefresh(update);
			}
		}

		private debouncedRefresh = debounce((update: ViewUpdate) => {
			this.statefulDecorationsSet.updateAsyncDecorations(update.view.state, this.show);
		}, CONSTANTS.DEBOUNCE_DELAY_LONG_MS, true)

		private getCurrentFilePath(view: EditorView): string | null {
			const field = view.state.field(editorViewField, false);
			return field?.file?.path ?? null;
		}

		private scheduleInitialRefreshIfNeeded(): void {
			if (this.initialRefreshTimer) {
				return;
			}

			const delay = AsyncViewPluginController.INITIAL_STABILIZATION_DELAYS_MS[this.initialRefreshAttempt];
			if (delay == null) {
				return;
			}

			this.initialRefreshTimer = setTimeout(() => {
				this.initialRefreshTimer = null;
				if (!this.view?.state) {
					return;
				}

				this.currentFilePath = this.getCurrentFilePath(this.view);
				this.initialRefreshAttempt += 1;
				this.statefulDecorationsSet.cancelPendingUpdates();
				this.debouncedRefresh?.cancel?.();
				this.statefulDecorationsSet.updateAsyncDecorations(this.view.state, this.show);
				this.scheduleInitialRefreshIfNeeded();
			}, delay);
		}

		private clearInitialRefreshTimer(): void {
			if (this.initialRefreshTimer) {
				clearTimeout(this.initialRefreshTimer);
				this.initialRefreshTimer = null;
			}
		}

		destroy() {
			// Cancel debounced callback to prevent post-destroy execution
			this.debouncedRefresh?.cancel?.();
			this.clearInitialRefreshTimer();
			// Cancel any pending async updates
			this.statefulDecorationsSet.cancelPendingUpdates();
			AsyncViewPluginController.activeControllers.delete(this);
		}

}

const asyncViewPlugin = ViewPlugin.fromClass(AsyncViewPluginController);

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]

export function refreshAllInfluxEditorViews(): void {
	for (const controller of AsyncViewPluginController.activeControllers) {
		controller.refreshNow();
	}
}



import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./StatefulDecorationSet";
import { statefulDecorations } from "./helpers";
import { debounce, editorViewField } from "obsidian";
import { CONSTANTS } from '../constants';


const asyncViewPlugin = ViewPlugin.fromClass(
    class {
        statefulDecorationsSet: StatefulDecorationSet;
        private show: boolean = true;
        private currentFilePath: string | null = null;

        constructor(view: EditorView) {
            this.statefulDecorationsSet = new StatefulDecorationSet(view);
            this.currentFilePath = this.getCurrentFilePath(view);
            // Start initial decoration computation
            this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
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
				this.statefulDecorationsSet.updateAsyncDecorations(update.view.state, this.show);
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

		destroy() {
			// Cancel debounced callback to prevent post-destroy execution
			this.debouncedRefresh?.cancel?.();
			// Cancel any pending async updates
			this.statefulDecorationsSet.cancelPendingUpdates();
		}

    }
);

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]



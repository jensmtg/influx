import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./StatefulDecorationSet";
import { statefulDecorations } from "./helpers";
import { debounce } from "obsidian";
import { CONSTANTS } from '../constants';


const asyncViewPlugin = ViewPlugin.fromClass(
    class {
        statefulDecorationsSet: StatefulDecorationSet;
        private show: boolean = true;

        constructor(view: EditorView) {
            this.statefulDecorationsSet = new StatefulDecorationSet(view);
            // Start initial decoration computation
            this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
        }

        hideInflux(view: EditorView) {
            if (this.show === false) return;
            this.show = false;
            this.statefulDecorationsSet.updateAsyncDecorations(view.state, false);
        }

        showInflux(view: EditorView) {
            if (this.show === true) return;
            this.show = true;
            this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
         }

        update(update: ViewUpdate) {
			/** Only changes within the same host document flow to this diffing point.
			 * Changes to title of document is not caught.
			 * Changes to other documents that are referenced in influx of host file are not caught.
			 */
			if (update.docChanged) {
				// Cancel any pending updates before scheduling new ones
				this.statefulDecorationsSet.cancelPendingUpdates();
				this.debouncedShow(update);
			}
		}

		private debouncedShow = debounce((update: ViewUpdate) => {
			this.showInflux(update.view);
		}, CONSTANTS.DEBOUNCE_DELAY_LONG_MS, true)

		destroy() {
			// Cancel debounced callback to prevent post-destroy execution
			this.debouncedShow?.cancel?.();
			// Cancel any pending async updates
			this.statefulDecorationsSet.cancelPendingUpdates();
		}

    }
);

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]



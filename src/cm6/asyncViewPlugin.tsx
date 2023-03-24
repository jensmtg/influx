import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./StatefulDecorationSet";
import { statefulDecorations } from "./helpers";
import { debounce } from "obsidian";


const asyncViewPlugin = ViewPlugin.fromClass(
    class {
        statefulDecorationsSet: StatefulDecorationSet;

        constructor(view: EditorView) {
            this.statefulDecorationsSet = new StatefulDecorationSet(view);
            this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
        }

        hideInflux(view: EditorView) {
            this.statefulDecorationsSet.updateAsyncDecorations(view.state, false);
        }

        showInflux(view: EditorView) {
            this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
         }

		update(update: ViewUpdate) {
			/** Only changes within the same host document flow to this diffing point.
			 * Changes to title of document is not caught.
			 * Changes to other documents that are referenced in the influx of host file are not caught.
			 */
			if (update.docChanged) {
				this.debouncedShow(update)
			}
		}

		debouncedShow = debounce((update: ViewUpdate) => {
			this.showInflux(update.view);
		}, 3000, true)


		destroy() {
		}

    }
);

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]



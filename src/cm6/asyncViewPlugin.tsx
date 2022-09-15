import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./StatefulDecorationSet";
import { statefulDecorations } from "./helpers";


const asyncViewPlugin = ViewPlugin.fromClass(
    class {
        statefulDecorationsSet: StatefulDecorationSet;

        constructor(view: EditorView) {
            this.statefulDecorationsSet = new StatefulDecorationSet(view);
            this.buildAsyncDecorations(view);
        }

        update(update: ViewUpdate) {
            /** Only changes within the same host document flow to this diffing point.
             * Changes to title of document is not caught.
             * Changes to other documents that are referenced in the influx of host file are not caught.
            */
            if (update.docChanged || update.viewportChanged) {
                this.buildAsyncDecorations(update.view);
            }
        }

        destroy() { }

        buildAsyncDecorations(view: EditorView) {
            this.statefulDecorationsSet.debouncedUpdate(view.state);
        }
    }
);

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]



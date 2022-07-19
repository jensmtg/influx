import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./StatefulDecorationSet";
import { statefulDecorations } from "./helpers";


const asyncViewPlugin = ViewPlugin.fromClass(
    class {
        decoManager: StatefulDecorationSet;

        constructor(view: EditorView) {
            this.decoManager = new StatefulDecorationSet(view);
            this.buildAsyncDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.buildAsyncDecorations(update.view);
            }
        }

        destroy() { }

        buildAsyncDecorations(view: EditorView) {
            this.decoManager.debouncedUpdate(view.state);
        }
    }
);

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]



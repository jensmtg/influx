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



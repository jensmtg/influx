import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./StatefulDecorationSet";
import { statefulDecorations } from "./helpers";
import { editorViewField } from "obsidian";
import ObsidianInflux from "src/main";


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
            if (update.docChanged || update.viewportChanged) {
                const { app } = this.statefulDecorationsSet.editor.state.field(editorViewField)
                 // @ts-ignore
                const influx: ObsidianInflux = app?.plugins?.plugins?.influx
                influx.delayShowInflux(() => this.showInflux(update.view))
                this.hideInflux(update.view)
            }
        }

        destroy() { }

    }
);

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]



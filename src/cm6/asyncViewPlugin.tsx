import { EditorView, ViewUpdate, ViewPlugin } from "@codemirror/view";
import { StatefulDecorationSet } from "./StatefulDecorationSet";
import { statefulDecorations } from "./helpers";
import { debounce, Platform } from "obsidian";
import { shouldSuppressInfluxForTableEditing } from "./placement-utils";

const activeEditorPlugins = new Set<InfluxEditorViewPlugin>();

class InfluxEditorViewPlugin {
    statefulDecorationsSet: StatefulDecorationSet;
    private view: EditorView;

    constructor(view: EditorView) {
        this.view = view;
        this.statefulDecorationsSet = new StatefulDecorationSet(view);
        activeEditorPlugins.add(this);
        this.statefulDecorationsSet.updateAsyncDecorations(view.state, true);
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
            if (Platform.isMobile && shouldSuppressInfluxForTableEditing(update.view.state)) {
                // Mobile: recomputing on the 3s debounce while the virtual keyboard
                // is open inserts/removes a block widget mid-composition, forcing a
                // re-measure that glitches scroll position away from the caret.
                // Drop the widget immediately, then let the regular debounced
                // recomputation restore it once editing settles.
                this.debouncedShow?.cancel?.();
                this.hideWidgetSoon();
                this.debouncedShow(update.view);
                return;
            }
            this.debouncedShow(update.view);
            return;
        }

        if (Platform.isMobile && update.selectionSet) {
            // Mobile taps move the caret without changing the document, so
            // doc-only updates leave stale widgets anchored near tables. Keep
            // suppression in sync with the caret position as it moves.
            if (shouldSuppressInfluxForTableEditing(update.view.state)) {
                this.hideWidgetSoon();
            } else {
                this.debouncedShow(update.view);
            }
        }
    }

    private hidePending = false;

    /** Defer one frame so we never dispatch during an in-progress CM6 update cycle. */
    private hideWidgetSoon(): void {
        if (this.hidePending) return;
        this.hidePending = true;
        queueMicrotask(() => {
            this.hidePending = false;
            try {
                this.statefulDecorationsSet.hideIfShowing();
            } catch {
                // View may already be tearing down; ignore.
            }
        });
    }

    debouncedShow = debounce((view: EditorView) => {
        this.showInflux(view);
    }, 3000, true)

    async refreshForBacklinkChange(): Promise<void> {
        if (await this.statefulDecorationsSet.backlinkSourcesChanged()) {
            this.debouncedShow?.cancel?.();
            this.showInflux(this.view);
        }
    }

    refresh() {
        this.debouncedShow?.cancel?.();
        this.showInflux(this.view);
    }

    destroy() {
        activeEditorPlugins.delete(this);
        this.debouncedShow?.cancel?.();
        this.statefulDecorationsSet.destroy();
    }
}

const asyncViewPlugin = ViewPlugin.fromClass(InfluxEditorViewPlugin);

/**
 * Refresh open editors when backlink metadata changes. Source signatures make
 * this a cheap no-op unless an incoming source was added or removed.
 */
export async function refreshInfluxEditorDecorations(backlinksOnly = false): Promise<void> {
    await Promise.allSettled(Array.from(activeEditorPlugins, async editorPlugin => {
        if (backlinksOnly) {
            await editorPlugin.refreshForBacklinkChange();
            return;
        }
        editorPlugin.refresh();
    }));
}

export const asyncDecoBuilderExt = [statefulDecorations.field, asyncViewPlugin]

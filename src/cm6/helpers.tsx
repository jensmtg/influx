import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, StateEffectType } from "@codemirror/state";

export const INFLUX_EDITOR_CLASS = "influx-editor-has-widget";


// Generic helper for creating pairs of editor state fields and
// effects to model imperatively updated decorations.
// source: https://github.com/ChromeDevTools/devtools-frontend/blob/8f098d33cda3dd94b53e9506cd3883d0dccc339e/front_end/panels/sources/DebuggerPlugin.ts#L1722
function defineStatefulDecoration(): {
    update: StateEffectType<DecorationSet>;
    field: StateField<DecorationSet>;
} {
    const update = StateEffect.define<DecorationSet>();
    const field = StateField.define<DecorationSet>({
        create(): DecorationSet {
            return Decoration.none;
        },
        update(deco, tr): DecorationSet {
            return tr.effects.reduce((deco, effect) => {
                return effect.is(update) ? effect.value : deco
            }, deco.map(tr.changes));
        },
        provide: field => [
            EditorView.decorations.from(field),
            // Keep the scroll-padding override tied to the logical decoration,
            // not to a widget DOM node. CodeMirror may temporarily detach and
            // recreate block-widget DOM while the decoration is still active.
            EditorView.editorAttributes.from(field, decorations => (
                decorations.size > 0
                    ? { class: INFLUX_EDITOR_CLASS }
                    : {}
            )),
        ],
    });
    return { update, field };
}


export const statefulDecorations = defineStatefulDecoration();

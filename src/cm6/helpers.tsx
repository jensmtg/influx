import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, StateEffectType } from "@codemirror/state";

// Generic helper for creating pairs of editor state fields and
// effects to model imperatively updated decorations.
// source: https://github.com/ChromeDevTools/devtools-frontend/blob/8f098d33cda3dd94b53e9506cd3883d0dccc339e/front_end/panels/sources/DebuggerPlugin.ts#L1722
function defineStatefulDecoration(): {
    update: StateEffectType<DecorationSet>;
    field: StateField<DecorationSet>;
    request: StateEffectType<{ show: boolean }>;
} {
    const update = StateEffect.define<DecorationSet>();
    const request = StateEffect.define<{ show: boolean }>();
    const field = StateField.define<DecorationSet>({
        create(): DecorationSet {
            return Decoration.none;
        },
        update(deco, tr): DecorationSet {
            // First apply any update effects (synchronous)
            let newDeco = tr.effects.reduce((deco, effect) => {
                return effect.is(update) ? effect.value : deco
            }, deco.map(tr.changes));

            // Check for request effects that indicate async update is needed
            for (const effect of tr.effects) {
                if (effect.is(request)) {
                    // Store the request in a transaction annotation so the ViewPlugin can see it
                    // This allows the ViewPlugin to compute decorations asynchronously
                    // and then dispatch with an update effect
                }
            }

            return newDeco;
        },
        provide: field => EditorView.decorations.from(field),
    });
    return { update, field, request };
}


export const statefulDecorations = defineStatefulDecoration();
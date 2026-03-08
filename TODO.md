# TODO

Ideas on what to keep working on before we are happy and ready for the new Influx version 3.0.0.

## Must do before release

- [ ] Do one last manual regression pass in a real Obsidian vault across editor, reading view, and sidebar mode.
- [ ] Re-check the frontmatter-link policy against mixed allow and deny property cases in a real vault, not just tests.
- [ ] Do a final release sanity pass on `manifest.json`, packaged files, and marketplace-facing copy.

## Strongly consider these bad bois

- [ ] Trim or rewrite any remaining brittle tests that still assert static markup or internal wiring more than behavior.
- [ ] Decide whether production should keep exposing `window.influxPlugin` and `window.influxDebug`, or gate them more tightly.
- [ ] Do one more settings UX pass for copy, grouping, and affordances now that the settings UI is schema-driven..)

## Optional, but deserved

- [ ] Add a little more lifecycle coverage around `markdown-mount` and toolbar cleanup.
- [ ] Expand plugin-trigger coverage around rename, delete, and non-modify update behavior if new regressions appear.
- [ ] Remove dead or low-value code paths in `src/domain/backlinks/frontmatter-links.ts` (if they truly unused.)

## Advanced but nice to have

- [ ] Start the `strictNullChecks` migration and keep the first slice painfully small. (I am no bueno with this. I have been delaying it tbh.)
- [ ] Keep breaking large responsibilities out of `src/domain/backlinks/influx-file.ts` until it is easier to maintain.
- [ ] Continue reducing cross-layer coupling between plugin bootstrap, settings policy, and render/update orchestration. (This caused the most bugs before the rewrite.)
- [ ] Keep deleting tests that only defend implementation noise, even if the total test count goes down. (Improve at test making a little everyday!)

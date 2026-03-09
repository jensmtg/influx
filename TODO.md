# TODO

Ideas on what to keep working on before we are happy and ready for the new Influx version 3.0.0.

## Must do before release

- [x] Fix the stale-update path so open editor and reading-view Influx surfaces refresh when linked source notes are modified, renamed, or deleted.
- [x] Make sure dependency-driven invalidation also busts the short-lived `InfluxFile` and editor decoration memo caches, not just the shared cache manager.
- [x] Decide what our stance is on case-sensitive paths and vaults, then make the path normalization behavior match that decision.
- [ ] Do one last manual regression pass in a real Obsidian vault across editor, reading view, and sidebar mode.
- [ ] During that vault pass, explicitly verify first-open behavior on notes with query, tasks, and mermaid blocks.
- [ ] During that same vault pass, hammer on modify, rename, delete, and fast repeated updates to make sure preview/editor/sidebar all stay honest.
- [ ] Re-check the frontmatter-link policy in a real vault against mixed property cases, alias/path variants, and duplicate-target cases.
- [ ] Do a final release sanity pass on `manifest.json`, `versions.json`, packaged files, and marketplace-facing copy.
- [x] Keep `window.influxPlugin` as the runtime bridge for editor integrations, but gate `window.influxDebug` and `testInfluxReadingView` behind debug mode.

## Manual vault verification checklist

- [ ] Open a target note with backlinks in editor, reading view, and sidebar; make sure Influx appears correctly in all three.
- [ ] On first open, verify notes with query, tasks, and mermaid blocks render correctly without needing a reopen or mode toggle.
- [ ] While keeping a target note open, modify, rename, and delete linked source notes; verify editor, preview, and sidebar all refresh honestly.
- [ ] Hammer on fast repeated updates: quick saves, rapid note switching, and repeated sidebar/editor focus changes.
- [ ] Re-check frontmatter link policy with mixed allow/deny properties, aliases, duplicate basenames, and path variants in a real vault.
- [ ] Toggle the important settings live and make sure visibility, sort order, list limit, and frontmatter behavior update without stale UI.
- [ ] If possible, test a case-sensitive or Linux-style path scenario (`Foo.md` vs `foo.md`) to make sure paths do not collide.
- [x] Cold-started a query note and a backlink-heavy note; Influx rendered without needing a reopen.
- [x] Switched between editor and reading mode on a backlink-heavy note; backlinks stayed visible across mode changes.

## Strongly consider before tagging

- [x] Add focused tests for dependency-driven refreshes so a source-note edit can no longer leave open targets stale.
- [x] Add at least one case-sensitive path regression test before we forget about Linux and weird vault setups again.
- [x] Revisit preview refresh throttling once the stale-update fixes land, just to make sure we are not hiding bursty real-world changes.
- [x] Do one more settings UX pass for copy, grouping, and affordances now that the settings UI is schema-driven.
- [ ] Trim or rewrite any remaining brittle tests that still assert static markup or internal wiring more than behavior.
- [x] Add one more focused lifecycle check around `MarkdownMount` and toolbar teardown if the manual pass exposes gaps.

## Optional, but deserved

- [x] Pick one canonical home for the shared update observable and delete the extra shim once imports are settled.
- [-] Flatten or rename the `features/editor/codemirror` area if we still agree the extra nesting is mostly path noise.
- [ ] Move plugin-specific view code out of the generic-sounding `ui/` bucket, or at least rename the files so their responsibilities are obvious.
- [ ] Remove dead or low-value code paths in `src/domain/backlinks/frontmatter-links.ts` if they are truly unused.
- [x] Split the update-event policy out of `src/ui/influx-react-component-helpers.ts` so it is not stuck in the same grab-bag file as search and pagination helpers.
- [ ] Keep breaking large responsibilities out of `src/domain/backlinks/influx-file.ts` until it is easier to maintain.
- [ ] Continue reducing cross-layer coupling between plugin bootstrap, settings policy, and render/update orchestration.

## Advanced but nice to have

- [x] Start the `strictNullChecks` migration with a tiny obsidian/window-guard slice, then keep expanding that safe little island through preview, sidebar, ui, and backlink files while it still stays boring.
- [ ] Keep deleting tests that only defend implementation noise, even if the total test count goes down.

# TODO

Current push before Influx `3.0.0`: finish the real-vault regression pass, fix the remaining link/refresh regressions we just found, and do the final release checks.

## Must do before release

- [ ] Fix reading-view and sidebar link behavior so source note titles and rendered excerpt links behave like real Obsidian links.
- [ ] Restore hover previews / hover editors for Influx links in reading view and sidebar.
- [ ] Fix the refresh path where a backlink can disappear after a source-link edit and fail to reappear when the link is added back.
- [ ] Re-test modify, rename, delete, and rapid repeated source-note changes after the backlink reappearance fix lands.
- [ ] Do one last manual regression pass in a real Obsidian vault across editor, reading view, and sidebar mode.
- [ ] During that vault pass, explicitly verify first-open behavior on notes with query, tasks, and mermaid blocks.
- [ ] Re-check the frontmatter-link policy in a real vault against mixed property cases, alias/path variants, and duplicate-target cases.
- [ ] Do a final release sanity pass on `manifest.json`, `versions.json`, packaged files, and marketplace-facing copy.

## Manual vault verification checklist

- [x] Open a target note with backlinks in editor, reading view, and sidebar; make sure Influx appears correctly in all three.
- [ ] In reading view, verify readable line length still constrains Influx correctly.
- [ ] In reading view, verify source note title links are clickable and navigate correctly.
- [ ] In reading view, verify rendered excerpt wikilinks/tags/internal links are clickable and navigate correctly.
- [ ] In reading view and sidebar, verify link hover previews / hover editors appear like normal Obsidian links.
- [x] On first open, verify query-heavy notes render correctly without needing a reopen or mode toggle.
- [ ] On first open, verify notes with tasks and mermaid blocks render correctly without needing a reopen or mode toggle.
- [ ] While keeping a target note open, modify, rename, and delete linked source notes; verify editor, preview, and sidebar all refresh honestly.
- [ ] Specifically verify a backlink disappears when its source link is removed and reappears when that source link is added back.
- [ ] Hammer on fast repeated updates: quick saves, rapid note switching, and repeated sidebar/editor focus changes.
- [ ] Re-check frontmatter link policy with mixed allow/deny properties, aliases, duplicate basenames, and path variants in a real vault.
- [ ] Toggle the important settings live and make sure visibility, sort order, list limit, and frontmatter behavior update without stale UI.
- [ ] If possible, test a case-sensitive or Linux-style path scenario (`Foo.md` vs `foo.md`) to make sure paths do not collide.
- [x] Cold-started a query note and a backlink-heavy note; Influx rendered without needing a reopen.
- [x] Switched between editor and reading mode on a backlink-heavy note; backlinks stayed visible across mode changes.
- [x] Restored readable line length alignment in reading view after the regression surfaced during manual testing.

## Recently completed

- [x] Add focused tests for dependency-driven refreshes so a source-note edit can no longer leave open targets stale.
- [x] Add at least one case-sensitive path regression test before we forget about Linux and weird vault setups again.
- [x] Revisit preview refresh throttling once the stale-update fixes land, just to make sure we are not hiding bursty real-world changes.
- [x] Do one more settings UX pass for copy, grouping, and affordances now that the settings UI is schema-driven.
- [x] Trim or rewrite a large batch of brittle tests that asserted static markup or internal wiring more than behavior.
- [x] Add one more focused lifecycle check around `MarkdownMount` and toolbar teardown if the manual pass exposes gaps.
- [x] Finish the `strictNullChecks` migration in the main source `tsconfig` and keep a simple single-source typecheck/build path.
- [x] Keep `window.influxPlugin` as the runtime bridge for editor integrations, but gate `window.influxDebug` and `testInfluxReadingView` behind debug mode.

## Nice to do after release blockers are gone

- [x] Pick one canonical home for the shared update observable and delete the extra shim once imports are settled.
- [-] Flatten or rename the `features/editor/codemirror` area if we still agree the extra nesting is mostly path noise.
- [ ] Move plugin-specific view code out of the generic-sounding `ui/` bucket, or at least rename the files so their responsibilities are obvious.
- [ ] Remove dead or low-value code paths in `src/domain/backlinks/frontmatter-links.ts` if they are truly unused.
- [x] Split the update-event policy out of `src/ui/influx-react-component-helpers.ts` so it is not stuck in the same grab-bag file as search and pagination helpers.
- [ ] Keep breaking large responsibilities out of `src/domain/backlinks/influx-file.ts` until it is easier to maintain.
- [ ] Continue reducing cross-layer coupling between plugin bootstrap, settings policy, and render/update orchestration.

## Extra cleanup only if we still want it

- [x] Start the `strictNullChecks` migration with a tiny obsidian/window-guard slice, then keep expanding that safe little island through preview, sidebar, ui, and backlink files while it still stays boring.
- [ ] Keep deleting tests that only defend implementation noise, even if the total test count goes down.

## Recommended next sequence

- [ ] Fix reading-view and sidebar link behavior first, because it blocks trustworthy manual verification.
- [ ] Then fix backlink reappearance after source-link edits and rerun the modify/rename/delete stress pass.
- [ ] Then finish the remaining manual vault checklist items for tasks, mermaid, frontmatter policy, and live settings changes.
- [ ] End with the release sanity pass on package contents and marketplace-facing metadata.

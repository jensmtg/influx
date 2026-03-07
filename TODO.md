# TODO

Ideas on what to keep working on before we are happy and ready for the new Influx version 3.0.0.

## Do first

- [x] Cover the editor pipeline with real tests (`src/features/editor/codemirror/`). It's still the big boi gap. I want tests for file-switch races, cancellation behavior, frontmatter/top insertion, and widget detach cleanup.
- [x] Add lifecycle coverage for `src/app/influx-plugin.ts`. Specifically: onload/onunload flow that has been buggy for a few cycles. Consider `window.influxPlugin` wiring + cleanup, root teardown, and update dispatch paths.
- [x] Add tests for `src/platform/obsidian/plugin-window-guards.ts`. (little guy but important)
- [x] Add `dispose()` to `PreviewManager` and call it on plugin unload. The `postProcessRefreshTimers` map can outlive the active instance. Clear timers and bail early when `plugin.isUnloading` is true.
- [x] Re-check frontmatter backlink behavior in `src/domain/backlinks/api-adapter.ts`. We currently merge `metadata.frontmatterLinks` from the target note into backlinks. Need to validate this against real Obsidian behavior and lock it with regression tests.

## Later

- [x] Normalize `filePath` keys in `src/platform/react/root-manager.ts`. We do this in cache manager already. Should do the same here so case-only renames and slash differences do not leave stale index entries. (as me how I know, lol)
- [x] Add a rename/delete stress test that spans editor + preview + sidebar. Recent race fixes are good, but this is the kind of thing that tends to regress quietly. (again, ask me how I know, oof)
- [x] Break up `display()` in `src/features/settings/settings-tab.ts`. It has grown too big for my brain.
- [x] Fix toolbar labels in `src/ui/influx-react-component.tsx`. For example: "Expand all / Collapse all" should always reflect the current collapsed state, including after per-item toggles.
- [ ] Add lifecycle/integration tests for `src/features/editor/codemirror/async-view-plugin.ts`. We covered `stateful-decoration-set` and widget cleanup, but the wrapper that handles file switches, debounce, hide/show, and destroy cleanup is still basically unguarded.
- [ ] Add mounted interaction tests for `src/ui/influx-react-component.tsx`. Current coverage is mostly helpers/static render; still missing live `influxUpdates$` subscription behavior, stale async update suppression, search debounce cleanup, and load-more interactions.
- [x] Add `onOpen()` / `onClose()` / event-wiring tests for `src/features/sidebar/influx-sidebar-view.tsx`. Current tests cover update races well, but not root lifecycle, event registration, or close-during-work cleanup.
- [ ] Bring the inline UX back toward `docs/assets/screencap.png`. In particular: restore the quieter note-integrated section header, reduce toolbar/panel feel, and make result rows behave like real two-column source+excerpt note rows again.

## Finally

- [x] Decide on CSS compatibility policy and document it. (it's messy right now while we are trying to land on a final design and style) Consider adding fallback styles.
- [x] Add practical size limits to long-lived caches (`fileCache`, `backlinksCache`, `previewFileHashes`). Right now eviction depends mostly on TTL checks during reads.
- [x] Consider expanding snippet sanitization in `src/ui/markdown-mount.tsx` if needed. We already neutralize ` ```query`; may also need coverage for things like `dataview` / `dataviewjs`. (Should help improve future inter-plugin compatibility.)
- [x] Add a settings-tab display smoke test that exercises the main section wiring after the `display()` refactor. Right now tests only cover `saveSettings()` and frontmatter-property validation.
- [ ] Start tightening TS nullability (begin with `strictNullChecks`). A lot of core paths still rely on loose null handling.

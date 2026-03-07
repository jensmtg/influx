# TODO

Ideas on what to keep working on before we are happy and ready for the new Influx version 3.0.0.

## Do first

- [ ] Cover the editor pipeline with real tests (`src/features/editor/codemirror/`). It's still the big boi gap. I want tests for file-switch races, cancellation behavior, frontmatter/top insertion, and widget detach cleanup.
- [x] Add lifecycle coverage for `src/app/influx-plugin.ts`. Specifically: onload/onunload flow that has been buggy for a few cycles. Consider `window.influxPlugin` wiring + cleanup, root teardown, and update dispatch paths.
- [x] Add tests for `src/platform/obsidian/plugin-window-guards.ts`. (little guy but important)
- [x] Add `dispose()` to `PreviewManager` and call it on plugin unload. The `postProcessRefreshTimers` map can outlive the active instance. Clear timers and bail early when `plugin.isUnloading` is true.
- [ ] Re-check frontmatter backlink behavior in `src/domain/backlinks/api-adapter.ts`. We currently merge `metadata.frontmatterLinks` from the target note into backlinks. Need to validate this against real Obsidian behavior and lock it with regression tests.

## Later

- [ ] Normalize `filePath` keys in `src/platform/react/root-manager.ts`. We do this in cache manager already. Should do the same here so case-only renames and slash differences do not leave stale index entries. (as me how I know, lol)
- [ ] Add a rename/delete stress test that spans editor + preview + sidebar. Recent race fixes are good, but this is the kind of thing that tends to regress quietly. (again, ask me how I know, oof)
- [ ] Break up `display()` in `src/features/settings/settings-tab.ts`. It has grown too big for my brain.
- [ ] Fix toolbar labels in `src/ui/influx-react-component.tsx`. For example: "Expand all / Collapse all" should always reflect the current collapsed state, including after per-item toggles.

## Finally

- [ ] Decide on CSS compatibility policy and document it. (it's messy right now while we are trying to land on a final design and style) Consider adding fallback styles.
- [ ] Add practical size limits to long-lived caches (`fileCache`, `backlinksCache`, `previewFileHashes`). Right now eviction depends mostly on TTL checks during reads.
- [ ] Consider expanding snippet sanitization in `src/ui/markdown-mount.tsx` if needed. We already neutralize ` ```query`; may also need coverage for things like `dataview` / `dataviewjs`. (Should help improve future inter-plugin compatibility.)
- [ ] Start tightening TS nullability (begin with `strictNullChecks`). A lot of core paths still rely on loose null handling.

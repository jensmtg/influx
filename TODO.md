# TODO

We are close to Influx `3.0.0`. This reflects findings from the latest code review.

## Pre-Release Manual Testing

- [ ] Run focused manual pass in real vault: editor, Reading view, sidebar
- [ ] Modify/rename/delete linked source notes rapidly; verify all views refresh
- [ ] Stress Reading-view rebuilds: reopen notes, flip modes, deferred leaves, edit during post-processor
- [ ] Verify link behavior: source titles, excerpt wikilinks/tags, hover previews/editors
- [ ] Check first-open on notes with `query`, `tasks`, mermaid blocks
- [ ] Test frontmatter-link policy: mixed allow/deny, aliases, duplicate basenames, path variants
- [ ] Watch for lag during bursty updates
- [ ] Test folder rename/delete; descendant invalidation may be wrong (exact-path-based)
- [ ] Test case-sensitive paths (`Foo.md` vs `foo.md`)

## Release Prep

- [ ] Final sanity pass on `manifest.json`, `versions.json`, packaged files, marketplace copy
- [ ] Decide `minAppVersion`: keep `1.0.0` with guards or raise to `1.7.2`

## Code Quality Items

- [ ] Break up `preview-manager.tsx` (727 lines) → `preview-host-tracking.ts`, `preview-render-scheduler.ts`, `preview-cleanup.ts`
- [ ] Extract hooks from `influx-react-component.tsx` (454 lines) → `useSearch()`, `useVirtualization()`, `useInfluxUpdates()`
- [ ] Split `influx-react-component-helpers.ts` (389 lines) → `search/`, `virtualization/`, `labels/` modules
- [ ] Normalize backlink data to single type (Map) at adapter boundary; remove Map/Record duality
- [ ] Review `frontmatter-links.ts`: position-based detection is fragile, consider alternatives
- [ ] Simplify cache invalidation: per-cache revision counters or TTL-only instead of global `dependencyRevision`
- [ ] Review `api-adapter.ts` reconciliation: can `resolvedLinks` logic be simplified?

### Things to Consider

- [ ] Break up `parser.ts` state machine into mode-specific parsers
- [ ] Refactor `stringify.ts` closure mutation to explicit accumulator
- [ ] Extract decoration computation from `stateful-decoration-set.ts`
- [ ] Convert `inlinking-file.ts` `makeSummary()` from mutating method to pure function
- [ ] Extract sidebar state/update logic from `influx-sidebar-view.tsx`
- [ ] Add JSDoc to `constants.ts` groupings
- [ ] Add JSDoc to complex settings in `settings.ts` (`showBehaviour` vs `sourceBehaviour`)
- [ ] Stricter `LogContext` typing (replace `unknown`)
- [ ] Review if metrics system is used (buffers 200 events, no export)
- [ ] Check `components/icons/` for unused icons
- [ ] Document or remove empty `integration/` directory

## Historical Context

Items from previous reviews, kept for reference:

- Backlink source-of-truth: `resolvedLinks` reconciliation added to fix stale links; layering around `getBacklinksForFile` is complex
- Reading-view compatibility: Non-public APIs used (`previewMode`, `containerEl`, `rerender(true)`, deferred-leaf loading); spread across preview code
- Multi-path preview recovery: Complex fallback logic; evaluate simplification after manual testing

## Archive (Completed)

- [x] Source-driven refreshes carry fresh-backlink/skip-recent-build flags
- [x] Backlink truth reconciles against `metadataCache.resolvedLinks`
- [x] `InfluxFile` synchronous initialization
- [x] Reading-view refresh coalescing, no rerender loops
- [x] Snippet sanitization for `query`, `dataview`, `dataviewjs`, `tasks`
- [x] Shared update bus queues events
- [x] Sidebar lifecycle: mounted shell, survivable cancellation
- [x] Test suite: behavior-level tests, reduced from 23 to 4 preview tests
- [x] Split `computeSettingsHash()` into render/build hashes
- [x] Remove `PreviewHashCacheStore`, freshness on `rootManager`
- [x] Extract shared-update decision helper

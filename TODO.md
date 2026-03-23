# TODO

We are close to Influx `3.0.0`.

The code is in much better shape now; the main thing left is a real-vault pass to make sure the Reading-view and sidebar work is actually solid under normal use, weird timing, and repeated updates. After that, do the release sanity checks and cut the version with a clear head. (Plus fix whatever we find along the way!)

## Do next

- [ ] Run one focused manual pass in a real Obsidian vault across editor, Reading view, and sidebar.
- [ ] While keeping a target note open, modify, rename, delete, and rapidly re-save linked source notes; make sure editor, preview, and sidebar all refresh honestly.
- [ ] Stress the Reading-view rebuild paths on purpose: reopen notes, flip modes, load deferred leaves, and edit while the markdown post-processor is rerunning.
- [ ] In Reading view and sidebar, verify link behavior end to end: source-note title links, excerpt wikilinks/tags/internal links, and hover previews / hover editors.
- [ ] Check first-open behavior on notes with `query`, `tasks`, and mermaid blocks; they should render correctly without needing a reopen or mode toggle.
- [ ] Re-check the frontmatter-link policy in a real vault with mixed allow/deny properties, aliases, duplicate basenames, and path variants.
- [ ] Watch for lag during very bursty updates. The shared update bus now queues correctly, but observer work is still serialized and cache churn may still be broader than it needs to be.
- [ ] Investigate folder rename/delete behavior. Rename handling now carries `oldPath`, but relevance checks are still exact-path-based, so descendant invalidation may still be wrong.
- [ ] If possible, test a case-sensitive or Linux-style path scenario (`Foo.md` vs `foo.md`) so we know whether path handling still has any blind spots.

## Release prep

- [ ] Do a final sanity pass on `manifest.json`, `versions.json`, packaged files, and marketplace-facing copy.
- [ ] Decide whether to keep `minAppVersion: 1.0.0` with guards or intentionally raise it to `1.7.2`, then update `manifest.json` and `versions.json` together.

## Test suite cleanup

- [ ] Prune or rewrite preview/sidebar tests that mostly spy on private methods, private fields, or exact internal call payloads. If a test is only asserting plumbing, cut it and replace it with a behavior-level regression.
- [x] Trimmed low-value sidebar listener-wiring tests and replaced that coverage with a current-file shared-update behavior check.
- [x] Cut several `preview-manager` tests that mostly pinned private routing, metadata caching, and timer coalescing internals.
- [x] Dropped several weaker private `handleEditorChange` tests instead of pretending they were strong coverage.
- [x] Softened the remaining preview host tests so they assert stable outcomes more than host-plumbing details.
- [x] Added coverage that `PreviewManager.dispose()` really cancels scheduled refresh work, not just immediate render paths.
- [ ] `tests/features/preview/preview-manager.test.ts`: cut the tests that mostly pin private routing and container plumbing (`handlePreviewMode` call coalescing via private spies, tracked-host routing payload checks, `schedulePreviewRefreshForPath` internals, DOM metadata caching checks). Replace them with a smaller set of end-behavior tests: stale UI cleanup, rerender fallback, late-render race safety, and tracked-host-vs-untracked-leaf outcomes.
- [ ] `tests/features/sidebar/influx-sidebar-view.test.ts`: trim the private harness bookkeeping tests around `registerFileEvents` / `handleEditorChange`. Keep the shared-update behavior coverage, but stop testing listener wiring and private method invocation as an end in itself.
- [x] Rewrote `tests/domain/backlinks/api-adapter-policy.test.ts` around actual policy behavior instead of regex-cache side effects.
- [ ] Add behavior-level coverage for `MarkdownMount` checkbox disabling and editor-mode normalization.
- [ ] Add focused coverage for shared updates that touch the current file path itself, so we verify that branch without relying on private sidebar internals.
- [ ] Add a regression that a hidden preview result cleans up stale preview UI, which is more valuable than several current routing-style preview tests.
- [x] Tracked and cleared pending preview-test timers so the focused Jest slice now exits cleanly again.

## After the vault pass

- [ ] Simplify the backlink source-of-truth path. The stale-link bug was a good reminder that we were layering cache invalidation around `getBacklinksForFile(...)` instead of keeping one cleaner authority for source-path membership.
- [ ] Decide whether to split cache invalidation by domain instead of using one global `dependencyRevision` for everything. Right now unrelated file changes can bust editor, preview, and list-build reuse together.
- [x] Split `computeSettingsHash(...)` into a preview/render hash and a narrower data/build hash. It started as preview freshness, but now the same hash also drives summary/list reuse.
- [x] Remove `PreviewHashCacheStore` and its cache-manager plumbing. Preview freshness now lives on `rootManager` metadata.
- [ ] Decide whether the remaining multi-path preview host recovery in `src/features/preview/preview-manager.tsx` and `src/features/preview/preview-manager-dom.ts` is still worth simplifying once the manual behavior is confirmed.
- [ ] Isolate and document the non-public Reading-view compatibility layer. Right now `previewMode`, `containerEl`, `rerender(true)`, `.markdown-preview-view`, deferred-leaf loading, and tracked post-processor host knowledge are spread across the preview code.
- [ ] Split `src/features/preview/preview-manager.tsx` into smaller pieces. It is doing DOM ownership, host tracking, render dedupe, scheduling, cleanup, and fallback recovery all in one place.
- [x] Extracted one small shared-update decision helper for sidebar/component paths and cut the unnecessary self-update backlink scan.
- [ ] Decide whether backlink data should be normalized to one internal shape at the adapter boundary instead of carrying both `Map` and object paths through hot code.
- [ ] If large-vault lag still shows up after the vault pass, measure the cost of `resolvedLinks` reconciliation before adding more refresh triggers around preview/sidebar updates.
- [ ] If strange fence styles beyond normal backticks and tildes matter in real vaults, verify whether snippet sanitization needs anything more exotic.

## Archive

- [x] Source-driven refreshes now carry fresh-backlink and skip-recent-build flags all the way through the sidebar/render pipeline, so that path no longer quietly falls back to stale caches.
- [x] Backlink source-path truth now reconciles against `metadataCache.resolvedLinks`, which fixed the stale broken-source case that could survive reopen/rebuild paths.
- [x] `InfluxFile` no longer carries a fake async initialization lifecycle; create/init is now synchronous again and the old initialized-guard ceremony is gone.
- [x] Reading-view refreshes are much less fragile now: duplicate post-processor renders are coalesced, tracked hosts no longer fall back into leaf rerender loops, older renders cannot paint over newer ones on the same host, and stale post-processor hosts get replaced when Obsidian rebuilds the preview root.
- [x] Snippet sanitization now disables `query`, `dataview`, `dataviewjs`, and `tasks` blocks for both backtick and tilde fences, including truncated quoted snippets.
- [x] The shared update bus now queues events instead of dropping intermediate ones, and editor/preview refresh no longer waits on slow observers.
- [x] Sidebar lifecycle is steadier: the shell stays mounted through cleanup, cancellation is survivable, and stale hidden results no longer win races.
- [x] Automated validation is clean again: Jest, `npm run typecheck`, and `npm run build` are all passing.

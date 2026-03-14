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
- [ ] Watch for lag during very bursty updates. The shared update bus now queues correctly, but observer work is still serialized.
- [ ] Investigate folder rename/delete behavior. Our update matching is still exact-path-based, so descendant cache invalidation may not be honest yet.
- [ ] If possible, test a case-sensitive or Linux-style path scenario (`Foo.md` vs `foo.md`) so we know whether path handling still has any blind spots.

## Release prep

- [ ] Do a final sanity pass on `manifest.json`, `versions.json`, packaged files, and marketplace-facing copy.
- [ ] Decide whether to keep `minAppVersion: 1.0.0` with guards or intentionally raise it to `1.7.2`, then update `manifest.json` and `versions.json` together.

## Test suite cleanup

- [ ] Prune or rewrite preview/sidebar tests that mostly spy on private methods, private fields, or exact internal call payloads. If a test is only asserting plumbing, cut it and replace it with a behavior-level regression.
- [x] Trimmed low-value sidebar listener-wiring tests and replaced that coverage with a current-file shared-update behavior check.
- [x] Cut several `preview-manager` tests that mostly pinned private routing, metadata caching, and timer coalescing internals.
- [x] Dropped several weaker private `handleEditorChange` tests instead of pretending they were strong coverage.
- [ ] `tests/features/preview/preview-manager.test.ts`: cut the tests that mostly pin private routing and container plumbing (`handlePreviewMode` call coalescing via private spies, tracked-host routing payload checks, `schedulePreviewRefreshForPath` internals, DOM metadata caching checks). Replace them with a smaller set of end-behavior tests: stale UI cleanup, rerender fallback, late-render race safety, and tracked-host-vs-untracked-leaf outcomes.
- [ ] `tests/features/sidebar/influx-sidebar-view.test.ts`: trim the private harness bookkeeping tests around `registerFileEvents` / `handleEditorChange`. Keep the shared-update behavior coverage, but stop testing listener wiring and private method invocation as an end in itself.
- [x] Rewrote `tests/domain/backlinks/api-adapter-policy.test.ts` around actual policy behavior instead of regex-cache side effects.
- [ ] Add behavior-level coverage for `MarkdownMount` checkbox disabling and editor-mode normalization.
- [ ] Add focused coverage for shared updates that touch the current file path itself, so we verify that branch without relying on private sidebar internals.
- [ ] Add a regression that a hidden preview result cleans up stale preview UI, which is more valuable than several current routing-style preview tests.
- [ ] Investigate the recurring Jest worker-exit warning in the preview/sidebar test slice. It may just be leftover scheduled preview timers, but it is noisy enough that we should either fix it or prove it harmless.

## After the vault pass

- [ ] Simplify the backlink source-of-truth path. The stale-link bug was a good reminder that we were layering cache invalidation around `getBacklinksForFile(...)` instead of keeping one cleaner authority for source-path membership.
- [ ] Decide whether `src/features/sidebar/influx-sidebar-view.tsx` should reuse `src/ui/influx-update-helpers.ts` instead of carrying its own parallel shared-update path.
- [ ] Decide whether the remaining multi-path preview host recovery in `src/features/preview/preview-manager.tsx` and `src/features/preview/preview-manager-dom.ts` is still worth simplifying once the manual behavior is confirmed.
- [ ] Isolate the non-public Reading-view compatibility layer. Right now `previewMode`, `containerEl`, `rerender(true)`, and `.markdown-preview-view` knowledge is spread across the preview code.
- [ ] Write one maintainer note that lists every intentional non-public Obsidian touchpoint we depend on: `previewMode`, `containerEl`, `rerender(true)`, `getBacklinksForFile`, `resolvedLinks`, and `.markdown-preview-view`.
- [ ] Split `src/features/preview/preview-manager.tsx` into smaller pieces. It is doing DOM ownership, host tracking, render dedupe, scheduling, cleanup, and fallback recovery all in one place.
- [ ] Make sidebar shared-update relevance checks cheaper. We currently blur together “does this change affect current backlinks?” and “refresh everything now,” which can force duplicate fresh-backlink work.
- [ ] Decide whether backlink data should be normalized to one internal shape at the adapter boundary instead of carrying both `Map` and object paths through hot code.
- [ ] Revisit the synthetic backlink-position fallback and decide whether inferred path-only backlinks should have an explicit representation instead of fake line numbers.
- [ ] Measure the large-vault cost of `resolvedLinks` reconciliation before adding any more refresh triggers around preview/sidebar updates.
- [ ] Keep reducing `src/features/preview/preview-manager.tsx` reliance on main-area leaf iteration for Reading-view fallback.
- [ ] Keep reducing `src/features/preview/preview-manager-dom.ts` reliance on `.markdown-preview-view` discovery for Reading-view ownership.
- [ ] If we come back for stronger sidebar parity later, gather verified API references for `MarkdownPreviewView`, deferred-view loading, and any supported preview-host embedding APIs before refactoring host semantics.
- [ ] If strange fence styles beyond normal backticks and tildes matter in real vaults, verify whether snippet sanitization needs anything more exotic.

## Archive

- [x] Source-driven refreshes now carry fresh-backlink and skip-recent-build flags all the way through the sidebar/render pipeline, so that path no longer quietly falls back to stale caches.
- [x] Backlink source-path truth now reconciles against `metadataCache.resolvedLinks`, which fixed the stale broken-source case that could survive reopen/rebuild paths.
- [x] Reading-view refreshes are much less fragile now: duplicate post-processor renders are coalesced, tracked hosts no longer fall back into leaf rerender loops, older renders cannot paint over newer ones on the same host, and stale post-processor hosts get replaced when Obsidian rebuilds the preview root.
- [x] Snippet sanitization now disables `query`, `dataview`, `dataviewjs`, and `tasks` blocks for both backtick and tilde fences, including truncated quoted snippets.
- [x] The shared update bus now queues events instead of dropping intermediate ones, and editor/preview refresh no longer waits on slow observers.
- [x] Sidebar lifecycle is steadier: the shell stays mounted through cleanup, cancellation is survivable, and stale hidden results no longer win races.
- [x] Automated validation is clean again: Jest, `npm run typecheck`, and `npm run build` are all passing.

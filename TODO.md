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

## After the vault pass

- [ ] Simplify the backlink source-of-truth path. The stale-link bug was a good reminder that we were layering cache invalidation around `getBacklinksForFile(...)` instead of keeping one cleaner authority for source-path membership.
- [ ] Decide whether `src/features/sidebar/influx-sidebar-view.tsx` should reuse `src/ui/influx-update-helpers.ts` instead of carrying its own parallel shared-update path.
- [ ] Decide whether the remaining multi-path preview host recovery in `src/features/preview/preview-manager.tsx` and `src/features/preview/preview-manager-dom.ts` is still worth simplifying once the manual behavior is confirmed.
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

# TODO

Current push before Influx `3.0.0`: finish the real-vault regression pass, close the remaining refresh/link regressions, and do the final release checks.

## Release blockers

- [ ] Re-verify reading-view and sidebar link behavior in a real vault, and fix any remaining gaps in source note title / rendered excerpt link navigation.
- [ ] Re-verify hover previews / hover editors for Influx links in reading view and sidebar, and fix any remaining gaps.
- [x] Fix the refresh path where a backlink can disappear after a source-link edit and fail to reappear when the link is added back.
- [ ] Re-test modify, rename, delete, and rapid repeated source-note changes after the backlink reappearance fix lands.
- [ ] Do one last manual regression pass in a real Obsidian vault across editor, reading view, and sidebar mode.
- [ ] During that vault pass, explicitly verify first-open behavior on notes with query, tasks, and mermaid blocks.
- [ ] Re-check the frontmatter-link policy in a real vault against mixed property cases, alias/path variants, and duplicate-target cases.
- [ ] Do a final release sanity pass on `manifest.json`, `versions.json`, packaged files, and marketplace-facing copy.
- [ ] During that release sanity pass, decide whether to keep `minAppVersion: 1.0.0` with compatibility guards or intentionally raise to `1.7.2` and update `manifest.json` / `versions.json` together.

## Current preview / architecture focus

- [ ] Keep reducing `src/features/preview/preview-manager.tsx` reliance on main-area leaf iteration for Reading-view fallback.
- [ ] Keep reducing `src/features/preview/preview-manager-dom.ts` reliance on `.markdown-preview-view` discovery for Reading-view ownership.
- [ ] If we want stronger sidebar parity later, gather verified API references for `MarkdownPreviewView`, deferred-view loading, and any supported preview-host embedding APIs before refactoring sidebar host semantics.

## Source sweep follow-ups

- [ ] Investigate folder rename/delete behavior before or during the vault pass: current event/update matching is exact-path-based, so folder operations may not invalidate descendant note caches or backlink relevance honestly.
- [ ] During the vault pass, watch for lag under very bursty updates: the shared update bus now queues events instead of dropping them, but observer work is still serialized per event.
- [ ] During the vault pass, verify that preview-mode startup no longer fan-outs duplicate post-processor renders for the same doc host, and note whether any remaining Tasks parser errors are only coming from the underlying note content rather than Influx excerpt rendering.
- [ ] During the vault pass, verify that targeted Reading-view refreshes no longer fall back into leaf-level rerender loops once a renderer-owned post-processor host already exists for that file.
- [ ] During the vault pass, re-verify source-note modify behavior after the latest cache fix: source-link edits should no longer poison target backlink caches or recent list-build caches with stale data.
- [ ] After the vault pass, simplify the backlink source-of-truth path: the recent stale-link bug showed we were layering cache invalidation around `getBacklinksForFile(...)` instead of keeping one clearer authority for source-path membership.
- [ ] After the vault pass, decide whether `src/features/sidebar/influx-sidebar-view.tsx` should reuse `src/ui/influx-update-helpers.ts` instead of carrying a parallel shared-update gating path.
- [ ] After the vault pass, decide whether the remaining multi-path preview host recovery in `src/features/preview/preview-manager.tsx` / `src/features/preview/preview-manager-dom.ts` is still worth simplifying once manual behavior is confirmed.
- [ ] If alternate fence styles matter in the vault, verify whether snippet sanitization also needs to neutralize non-triple-backtick `query` / `dataview` / `dataviewjs` / `tasks` fences.

## Manual vault checklist

- [ ] In reading view, verify readable line length still constrains Influx correctly.
- [ ] In reading view, verify source note title links are clickable and navigate correctly.
- [ ] In reading view, verify rendered excerpt wikilinks/tags/internal links are clickable and navigate correctly.
- [ ] In reading view and sidebar, verify link hover previews / hover editors appear like normal Obsidian links.
- [ ] On first open, verify notes with tasks and mermaid blocks render correctly without needing a reopen or mode toggle.
- [ ] While keeping a target note open, modify, rename, and delete linked source notes; verify editor, preview, and sidebar all refresh honestly.
- [ ] Specifically verify a backlink disappears when its source link is removed and reappears when that source link is added back.
- [ ] Hammer on fast repeated updates: quick saves, rapid note switching, and repeated sidebar/editor focus changes.
- [ ] Re-check frontmatter link policy with mixed allow/deny properties, aliases, duplicate basenames, and path variants in a real vault.
- [ ] Toggle the important settings live and make sure visibility, sort order, list limit, and frontmatter behavior update without stale UI.
- [ ] If possible, test a case-sensitive or Linux-style path scenario (`Foo.md` vs `foo.md`) to make sure paths do not collide.

## Recently landed

- [x] Moved Reading-view host ownership onto the markdown post-processor path with `MarkdownRenderChild`, direct renderer-owned refreshes, and delegated link/hover handling.
- [x] Replaced obsolete nested markdown rendering with `MarkdownRenderer.render(...)` and kept the editor path on the existing CM6 extension architecture.
- [x] Hardened preview/sidebar workspace handling around documented `MarkdownView` / deferred-view APIs, including `requireApiVersion('1.7.2')` guards and older sidebar fallbacks.
- [x] Simplified preview fallback so unowned leaves rerender through Obsidian instead of adopting stray containers, and tracked preview roots now carry `previewRoot` metadata through `rootManager` and metadata-backed tracked-host lookup.
- [x] Made global and targeted preview refresh treat live post-processor-owned Reading-view hosts as tracked refresh targets before falling back to root-leaf iteration.
- [x] Cached `previewRoot` metadata back into `rootManager` when tracked-host recovery has to fall back to preview DOM, so later refreshes can stay on owned metadata paths.
- [x] Taught the main render path to prefer metadata-backed tracked-host lookup both before render and after preview-root changes, with DOM container discovery left as fallback only.
- [x] Reduced global preview refresh churn from the call site by routing `file-open` and `mode-change` through targeted preview refresh, while keeping dependency-changing ops on global refresh.
- [x] Fixed the likely backlink reappearance/removal refresh bug by making `InfluxFile.shouldUpdate(...)` treat a changed source path as relevant if it appeared either before or after backlink recomputation, with focused domain/helper regressions.
- [x] Added a mounted UI regression proving `modify` updates propagate backlink disappearance and reappearance all the way through `InfluxReactComponent` after source-note edits.
- [x] Verified and fixed broader lifecycle issues from review: sidebar roots now register with `rootManager`, overlapping sidebar live updates no longer reuse the same abort/sequence slot, preview freshness is tracked per root instead of per file, and update ops now use a typed shared event union.
- [x] Tightened rename/delete relevance before manual vault testing by carrying `oldPath` through shared rename updates and using `shouldUpdatePaths(...)` so unrelated renames stop forcing global UI refresh while still preserving source-removal/source-rename correctness.
- [x] Hardened more pre-vault edge cases: the shared update bus now queues events instead of dropping intermediate ones, editor/preview refresh no longer waits on slow bus observers, preview refresh reuses containers without deferred-unmount races, and sanitized markdown fences now close correctly for truncated and nested-fence snippets.
- [x] Current automated validation is clean again: full Jest suite, `npm run typecheck`, and `npm run build` all pass after the latest pre-vault fixes.
- [x] Final source sweep tightened a few more correctness edges: file cleanup now leaves the sidebar shell mounted, preview rebuilds keep the old render until the replacement work survives cancellation, and stale hidden sidebar results no longer overwrite newer state.
- [x] Runtime console sweep exposed and fixed two real preview/snippet issues: nested `MarkdownRenderer.render(...)` output now opts out of Influx's markdown post-processor recursion, and fenced `tasks` blocks are neutralized in backlink snippets so Tasks plugin parsing does not fire inside excerpt renders.
- [x] Emergency runtime pass also fixed a separate preview startup flood: concurrent markdown post-processor calls for the same doc host are now coalesced so Influx does not spin up duplicate preview pipeline renders while a host render is already in flight.
- [x] Emergency Reading-view investigation found another loop in targeted preview refresh: once a renderer-owned host existed for a file, targeted refresh was still falling back into leaf-level preview rerender for the same file, which could retrigger Reading-view post-processing indefinitely. Targeted refresh now stops at tracked renderer-owned hosts instead of re-rerendering the leaf fallback path.
- [x] Fixed a stale-backlink cache bug for source-note edits: source-driven refreshes now use uncached backlink reads and skip recent list-build cache reuse/storage, so a stale metadata snapshot during modify handling no longer poisons later reopen/rebuild paths.
- [x] Refined that stale-backlink fix after real-vault testing showed it was not enough: backlink source-path truth now reconciles against `metadataCache.resolvedLinks`, so stale `getBacklinksForFile(...)` output no longer keeps broken source notes alive after reopen.

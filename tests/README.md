# Tests Directory Guide

This directory mirrors the source structure in `src/` to keep ownership and navigation obvious.

## Layout

- `app/`: tests for plugin orchestration and event flows.
- `features/`: tests for editor/preview/sidebar/settings integrations.
- `domain/`: tests for backlinks, filtering, and structured-text logic.
- `platform/`: tests for infrastructure adapters and runtime bridges (cache, diagnostics, root tracking, window/obsidian guards).
- `ui/`: tests for rendering helpers, update-policy helpers, and UI state logic.
- `mocks/`: shared test doubles used by multiple suites.
- `helpers/`: local test utilities (fake DOM, fixtures, builders).

## Conventions

- Keep test file names in `kebab-case` and colocate by concern (for example `domain/backlinks/influx-file.test.ts`).
- Prefer `@/` imports for source modules to avoid brittle relative paths after refactors.
- Keep cross-suite mocks in `tests/mocks/`; avoid redefining global mocks in each file.
- When moving a source file, move its tests in the same commit or phase.
- Prefer behavior-focused assertions over brittle snapshots of static markup or internal wiring.
- When a shared runtime seam moves (for example a platform event bus or window bridge), update the source imports and the affected tests as well.

## Related Docs

- Source architecture and boundaries: `src/README.md`

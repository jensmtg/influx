# Influx Source Architecture

This file defines source-code boundaries for maintainability in 3.0.0+.

For test structure and testing conventions, see `tests/README.md`.

## Layering

Dependency flow is one-way:

`app -> features -> domain -> platform/shared`

Allowed cross-cutting modules:

- `config` can be imported by any layer.
- `types` can be imported by any layer.
- `ui` can be imported by features and app.

Practical note: shared runtime buses or bridges that are not owned by one feature belong in `platform/`, not as `app/` re-export shims.

## Folder Responsibilities

- `app/`: plugin bootstrap, lifecycle, and orchestration.
- `features/`: editor, preview, sidebar, and settings integrations.
- `domain/`: backlinks, summaries, filtering, and structured-text business logic.
- `platform/`: infrastructure adapters and runtime bridges (cache, diagnostics, shared event buses, react root tracking, obsidian/window guards).
- `shared/`: generic utilities with no domain knowledge.
- `config/`: constants and feature flags.
- `types/`: shared type contracts not tied to a single feature.
- `ui/`: React view components plus view-scoped UI helpers used by app/features.

## Naming Rules

- File names: `kebab-case` for both `.ts` and `.tsx`.
- Class/type identifiers: `PascalCase` (for example `InfluxSidebarView`, `PreviewManager`).
- Avoid `.tsx` for files that do not render JSX.
- Prefer clear role names (`BacklinksService`, `SettingsTab`, `PreviewManager`).
- If a helper file starts mixing search logic, update policy, and render state, split it by responsibility before it turns into a grab bag.

## Import Rules

- `domain` must not import from `features` or `app`.
- `features` must not import from `app`.
- `platform` must not import from `domain`, `features`, or `app`.
- `shared` must not import from `platform`, `domain`, `features`, or `app`.
- Prefer canonical imports for shared buses from `platform/events/*` instead of keeping parallel shims alive.

Rules are enforced in `eslint.config.js`.

## Runtime Bridge Notes

- `window.influxPlugin` is still the narrow runtime bridge used by editor integrations that cannot receive the plugin instance directly.
- `window.influxDebug` and `window.testInfluxReadingView` are debug-only helpers and should only exist when debug mode is enabled.

## Refactor Strategy

- Keep `src/main.tsx` as the thin build entrypoint.
- Move implementation classes behind `src/main.tsx`.
- Extract shared type contracts before moving infra/service classes.

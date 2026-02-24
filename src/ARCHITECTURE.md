# Influx Source Architecture

This document defines source-code boundaries for maintainability in 3.0.0+.

## Layering

Dependency flow is one-way:

`app -> features -> domain -> platform/shared`

Allowed cross-cutting modules:

- `config` can be imported by any layer.
- `types` can be imported by any layer.
- `ui` can be imported by features and app.

## Folder Responsibilities

- `app/`: plugin bootstrap, lifecycle, and event orchestration.
- `features/`: mode-specific integration (editor, preview, sidebar, settings).
- `domain/`: core backlinks and structured-text business logic.
- `platform/`: infrastructure adapters (cache, diagnostics, react root tracking, obsidian guards).
- `shared/`: generic utilities with no domain knowledge.
- `config/`: constants and feature flags.
- `types/`: shared type contracts not tied to a single feature.

## Naming Rules

- File names: `kebab-case` for both `.ts` and `.tsx`.
- Class/type identifiers: `PascalCase` (for example `InfluxSidebarView`, `PreviewManager`).
- Avoid `.tsx` for files that do not render JSX.
- Prefer clear role names (`BacklinksService`, `SettingsTab`, `PreviewManager`).

## Import Rules

- `domain` must not import from `features` or `app`.
- `features` must not import from `app`.
- `platform` must not import from `domain`, `features`, or `app`.
- `shared` must not import from `platform`, `domain`, `features`, or `app`.

Rules are enforced in `eslint.config.js`.

## Refactor Strategy

- Keep `src/main.tsx` as the thin build entrypoint.
- Move implementation classes behind `src/main.tsx`.
- Extract shared type contracts before moving infra/service classes.

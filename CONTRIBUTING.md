# Contributing

Thanks for taking an interest in Influx.

This is a single-maintainer project, so the easiest contributions to review are small, well-scoped, and tied to a clear bug or improvement. Larger ideas are still welcome, but it helps to open an issue or discussion first so the implementation direction does not drift.

## Prerequisites

- Node `20`
- npm
- A local Obsidian vault you can use as a test vault

CI also runs on Node 20 in `.github/workflows/build.yml`.

## Local Setup

```bash
npm install
```

## Development Commands

- `npm run dev` - esbuild watch mode
- `npm run lint` - lint the codebase
- `npm test` - run the test suite
- `npm run build` - type-check and build the plugin bundle
- `npm run lint && npm test && npm run build` - full validation pass
- `npm run serve` - local docs preview

## Local Obsidian Workflow

For UI, lifecycle, editor, preview, or sidebar changes, please test in a real Obsidian vault in addition to running automated checks.

Typical setup:

1. Create or pick a local test vault.
2. Create `.obsidian/plugins/influx/` inside that vault.
3. Copy or symlink `main.js`, `manifest.json`, and `styles.css` from this repo into that folder.
4. Run `npm run dev` while you work, or `npm run build` before manual verification.
5. Reload Obsidian and test the flows your change touches.

Good manual checks usually include:

- editor mode
- reading view
- sidebar mode
- switching between notes
- settings changes
- rename or delete behavior if your change affects updates or caching

## Code Style

- Use tabs for indentation.
- Keep LF line endings.
- Prefer ASCII unless the file already needs something else.

See `.editorconfig` for the project defaults.

## UI And CSS Conventions

- Prefer `influx-` prefixed class names for plugin-owned layout and controls.
- Avoid depending on Obsidian core structural class names for layout behavior.
- Use semantic interactive elements and meaningful `aria-label` values.
- Favor additive styling hooks over full layout overrides when possible.

## Testing Philosophy

Tests live in `tests/`.

- Prefer no test over a bad test.
- Add tests that catch real regressions, not tests that only inflate coverage.
- Keep tests deterministic, readable, and tied to user-visible or lifecycle-critical behavior.
- Prefer behavior assertions over implementation-detail assertions.

Useful default choices:

- Helper and unit tests for pure logic, parsing, matching, and state transitions
- Feature and lifecycle tests for race conditions, cleanup, view switching, and update coordination
- Render wiring tests when you need confidence in user-visible empty, loading, or interaction states

Try not to keep tests that are mostly snapshots, brittle timing exercises, or wrappers around mocks.

Before keeping a test, ask:

1. Would this fail on a plausible bug?
2. Does it protect important behavior?
3. Will it survive normal refactors?
4. Is it the smallest test that still proves the point?

## Pull Requests

Target the `master` branch.

Please include:

- a short explanation of the problem and the approach
- test updates when they add real value
- manual verification notes for UI or lifecycle changes
- validation output for `npm run lint && npm test && npm run build`

If a change is large, surprising, or breaking, start with an issue or discussion first.

## Issues And Discussions

- Bug reports: https://github.com/jensmtg/influx/issues/new?template=bug_report.md
- Feature requests: https://github.com/jensmtg/influx/issues/new?template=feature_request.md
- General discussion: https://github.com/jensmtg/influx/discussions

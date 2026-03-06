# Contributing

## Setup

```bash
npm install
```

## Development

- **Dev mode**: `npm run dev` (esbuild watch)
- **Lint**: `npm run lint`
- **Test**: `npm test`
- **Build**: `npm run build`
- **Full validation**: `npm run lint && npm test && npm run build`
- **Docs**: `npm run serve`

## Code Style

- Tabs for indentation (4 spaces)
- LF line endings

See [.editorconfig](.editorconfig).

## UI/CSS Conventions

- Prefer `influx-` prefixed class names for plugin-owned layout and controls.
- Avoid depending on Obsidian core structural class names for plugin layout behavior.
- Use semantic interactive elements (`button`, links, labels) and keep `aria-label` values meaningful.

## Testing

Tests live in `tests/`.

### Testing Philosophy

- Prefer no test over a bad test.
- Add tests that catch real regressions, not tests that only inflate coverage.
- Keep tests deterministic, readable, and tied to user-visible or lifecycle-critical behavior.

### Test Types and When to Use Them

- **Helper/unit tests (Node environment)**
  - Use for pure functions, state transitions, and decision logic.
  - Fast and stable; default choice for most new logic.

- **Render wiring tests (server render)**
  - Use when you need confidence that key UI text/state wiring is connected correctly.
  - Good for checking empty/load-more/status outputs without full DOM interaction complexity.

- **Feature/lifecycle tests with mocks**
  - Use for race conditions, cancellation ordering, stale update protection, and multi-pane behavior.
  - Focus assertions on outcomes that would represent a real bug if broken.

### What To Avoid

- Snapshot-heavy tests that do not encode meaningful behavior.
- Assertions on unstable implementation details.
- Brittle timing tests without clear lifecycle intent.

### Test Quality Checklist

Before keeping a new test, verify:

1. It would fail on a plausible bug (or did fail before the fix).
2. It validates an important behavior, not internal noise.
3. It remains stable across normal refactors.
4. It is the smallest test that still proves the behavior.

## Pull Requests

Target `master` branch. Include:
- Description of changes
- Test updates if applicable
- Validation output (`npm run lint && npm test && npm run build`)
- No breaking changes without issue

## Issues

Use [bug report](https://github.com/jensmtg/influx/issues/new?template=bug_report.md) or [feature request](https://github.com/jensmtg/influx/issues/new?template=feature_request.md) templates.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.1] - 2025-01-30

### Added

- Unit tests for settings validation utilities (YAML property name validation)
- Unit tests for filter and pattern matching logic
- Unit tests for dependency injection functions (actual production code):
  - `shouldShowInfluxWithMatcher()` with default and injected pattern matchers
  - `isIncludableSourceWithMatcher()` with default and injected pattern matchers
  - `shouldCollapseInfluxWithMatcher()` with default and injected pattern matchers
  - `createInlinkingFileComparator()` for all sorting attributes and principles
- Pure utility functions for settings, filtering, and sorting (extracted for testability)

### Changed

- Refactored apiAdapter.tsx methods to use extracted pure functions from settings-utils.ts:
  - `getShowStatus()` now delegates to `shouldShowInfluxWithMatcher()`
  - `isIncludableSource()` now delegates to `isIncludableSourceWithMatcher()`
  - `getCollapsedStatus()` now delegates to `shouldCollapseInfluxWithMatcher()`
  - `makeComparisonFn()` now delegates to `createInlinkingFileComparator()`
  - `compareLinkName()` now delegates to the pure function from settings-utils.ts
- Pure functions support dependency injection for pattern matching to preserve regex caching optimization

### Fixed

- Fixed sorting comparator flip logic: `NEWEST_FIRST` now correctly reverses order, `OLDEST_FIRST` preserves natural ascending order
  - Previously: flip was inverted, causing OLDEST_FIRST to sort descending and NEWEST_FIRST to sort ascending
  - Now: `flip = -1` for NEWEST_FIRST (reverse order), `flip = 1` for OLDEST_FIRST (natural order)
- Fixed race condition in `triggerUpdates` where concurrent file updates would cancel each other's timeouts
- Fixed memory leak by cleaning up React roots when files are renamed or deleted (both `updateInfluxInPreview` and `handlePreviewMode`)
- Fixed stale React root reuse in InfluxWidget by using container as WeakMap key
- Fixed cascading failures in `Promise.all` by adding error handling for individual file processing with user warning
- Fixed invalid regex patterns causing repeated error logging by caching sentinel values
- Fixed undefined `titleLineNum` by using nullish coalescing for explicit initialization
- Fixed inefficient DOM query in `cleanupReactRoots` by using direct child selector
- Fixed missing cleanup in `asyncViewPlugin.destroy()` by cancelling debounced callback
- Fixed empty document check to use exact equality (`=== 0`) for clarity

## [2.3.0] - 2026-01-29

### Added

- Front matter link processing: extract links from YAML front matter properties and include them in backlinks
- New unit tests for frontmatter, link, and structuredtext utilities
- YAML property name validation with user feedback in settings UI

### Fixed

- Fixed memory leak in previewFileHashes by clearing hashes when files are deleted or renamed
- Fixed memory leak in previewReactRoots by replacing WeakMap with Map and adding explicit cleanup
- Fixed blocking operation in InfluxFile constructor by implementing async factory pattern
- Fixed RangeError in StatefulDecorationSet when editor state is destroyed during async decoration updates
- Fixed DOM performance by replacing innerHTML with direct DOM manipulation for checkbox disabling
- Fixed code duplication in InfluxFile by unifying Map/Object iteration patterns
- Fixed stale settings cache by adding explicit invalidation on settings save
- Fixed race conditions in triggerUpdates by implementing update deduplication
- Fixed regex JIT overhead by pre-compiling all regex patterns at settings load time
- Fixed JSS stylesheet accumulation by only regenerating stylesheets when settings change (not on every update)
- Fixed mode switching overlap by improving cleanup of orphaned Influx wrappers and containers
- Fixed unused constant `DOM_STABILITY_DELAY_MS` by removing dead code
- Fixed displayText fallback to use nullish coalescing operator (??) for proper null/undefined handling
- Fixed YAML property validation to allow hyphens in property names
- Fixed max line width to respect Obsidian readable line length option

### Changed

- Extracted pure functions from ApiAdapter (frontmatter-utils.ts, link-utils.ts)
- Extracted pure functions from StructuredText class (structuredtext-utils.ts)
- Removed bad/integration tests that were testing mocks instead of real behavior
- Renamed test helper functions from createMock* to createTest* for clarity
- Added comprehensive documentation site using Docsify

## [2.2.2] - 2026-01-26

### Fixed

- Fixed race conditions in preview mode with per-file update tracking
- Fixed reading mode not displaying by implementing Markdown Post Processor approach
- Fixed editor mode not rendering by using global window plugin reference
- Fixed "Show influx below text" setting for edit and preview modes
- Fixed O(n²) frontmatter detection algorithm - now uses O(n) CodeMirror native API
- Fixed Promise constructor anti-pattern by replacing with proper async/await patterns
- Fixed React root memory leaks using WeakMap
- Fixed widget positioning for CodeMirror decorations
- Fixed frontmatter handling to position Influx after YAML blocks
- Fixed all remaining `@ts-ignore` usages with proper TypeScript type definitions
- Fixed `setInterval` runtime error by using `window.setInterval`
- Fixed excessive DOM manipulation - React roots are now reused
- Fixed markdown title rendering to properly remove leading underscores from italicized titles

### Changed

- Implemented dual approach: edit mode uses CodeMirror extensions, preview mode uses Markdown Post Processor
- Replaced `forEach` with `for...of` throughout codebase for better iteration performance
- Removed all console log statements for cleaner production output
- Replaced magic numbers with named constants

### Added

- Three-layer caching system in ApiAdapter (fileCache, backlinksCache, settingsCache)
- File hash-based change detection to skip unnecessary preview updates
- Regex pattern caching to avoid recompilation
- 8 new unit tests for race condition protection
- Markdown Post Processor for reading view integration
- Proper TypeScript type definitions and global Window interface extension

### Performance

- Frontmatter detection: O(n²) → O(n)
- File operations: 50-90% reduction in redundant I/O through caching
- DOM queries: classList.contains() instead of querySelector()
- Parallelized markdown rendering with Promise.all
- Single-pass string and array operations

## [2.2.1] - 2026-01-26

### Fixed

- Fixed null reference error in `StatefulDecorationSet.computeAsyncDecorations` when file object is null
- Added null safety check for plugin access in `StatefulDecorationSet.computeAsyncDecorations`
- Added null safety check for leaf type in `updateInfluxInAllPreviews`
- Added null safety for file processing in `InfluxFile.makeInfluxList` to filter out null files
- Added null safety for link position access in `InlinkingFile.makeSummary`
- Added null safety for title position access in `InlinkingFile.setTitle`

### Added

- Added unit tests for null safety scenarios

### Changed

- Improved test organization by adding `describe` blocks to `StructuredText.test.ts`
- Replaced `any` types with proper TypeScript types in test helper functions
- Fixed broken `.toBeFalsy` assertions in frontmatter tests
- Renamed test files from `.tsx` to `.ts` (no JSX content)

## [2.2.0] - 2026-01-26

This updates the plugin's dependency stack, bringing all major dependencies to their latest stable versions while maintaining full compatibility with the Obsidian ecosystem.

### Changed

- Major dependency updates:
  - React upgraded from 18 to 19
  - esbuild updated
  - Testing framework upgraded
  - TypeScript configuration updated for React 19 JSX transform
  - All development dependencies updated to latest stable versions

- Build configuration improvements:
  - Updated tsconfig.json to use React 19 JSX transform (`"jsx": "react-jsx"`)
  - Modernized esbuild.config.mjs for newer esbuild API (context API for watch mode)
  - Updated target to ES2020 for better modern browser support
  - Fixed JSX return type annotations for React 19 compatibility

- CodeMirror integration:
  - Pinned CodeMirror versions to match Obsidian 1.11.4 requirements
  - @codemirror/state: 6.5.0 (exact match for peer dependency)
  - @codemirror/view: 6.38.6 (compatible version)

- Development experience enhancements:
  - Removed deprecated @types/uuid (uuid provides its own types)
  - Updated @typescript-eslint packages
  - Updated Babel packages

### Fixed

- Resolved JSX namespace errors for React 19 compatibility
- Fixed esbuild watch mode using deprecated API
- Resolved peer dependency conflicts with Obsidian's CodeMirror versions
- All tests passing with updated testing framework

### Performance & Security

- Significant build performance improvements with esbuild 0.27
- Enhanced runtime performance with React 19 optimizations
- All security vulnerabilities addressed through dependency updates
- Modern JavaScript target (ES2020) for better performance

### Migration Notes

This is a breaking change release due to the React 19 upgrade and esbuild API changes. All existing functionality remains intact, but the plugin now uses updated versions of all dependencies.

## [2.1.4] - 2026-01-26

### Fixed

- Critical compatibility fix: Added Map compatibility for backlinks data structure (Obsidian changed from plain Object to Map)
- Added null safety checks to prevent crashes when backlinks/metadata is undefined
- Fixed `MarkdownRenderer` by passing Component parameter (fixes rendering issues with complex markdown like footnotes)
- Fixed show status logic in `computeAsyncDecorations`

### Changed

- `InfluxFile.tsx`: Added null safety in constructor, Map compatibility in `shouldUpdate()` and `makeInfluxList()`
- `apiAdapter.tsx`: Changed to extend Component instead of composition for proper MarkdownRenderer integration
- `InlinkingFile.tsx`: Added null safety for `meta.links` in `makeSummary()`
- `StatefulDecorationSet.tsx`: Fixed show status logic to check both global and file-specific show status

### Contributors

Thanks to @funamorikeitou (Serpsaipong Navanuraksa) for contributing the Map compatibility fix that resolves the critical Obsidian API breaking change.

## [2.1.3] - 2026-01-20

### Added

- CI workflow now runs on pull requests for better validation
- Yarn caching for GitHub Actions workflows (later disabled for CI compatibility)

### Changed

- Updated TypeScript to fix build errors
- Bumped all dependencies to latest versions

### Fixed

- Fixed plugin not working after Obsidian 1.7.6 update
- Fixed Influx not passing component in renderMarkdown
- Fixed title rendering by properly handling HTML tags (resolves display of unwanted 'ir="auto">' prefix)
- Fixed reading mode insertion point
- Disabled yarn cache for CI test compatibility

## [2.1.2] - 2023-02-02

This update reimplemented part of the core of the Influx plugin - the functions that generate the excerpts. The new implementation is more robust, more correct, and includes extensive test coverage, making it easier to maintain and make changes without breaking other features.

### Added

- Influx in reading mode is now enabled

### Changed

- Reimplemented core excerpt generation functions for better robustness
- Improved handling of nested callouts, ordered lists, different indentation levels, tables, and LaTeX blocks

### Fixed

- Workaround for text appearing below Influx component when typing (by hiding Influx while typing)

### Contributors

Thanks to @kenlim (Ken Lim) for contributing to development through a pull request!

## [2.1.1] - 2023-02-02

### Changed

- Version bump only

## [2.1.0] - 2023-02-02

This update reimplemented part of the core of the Influx plugin - the functions that generate the excerpts. The new implementation is more robust, more correct, and includes extensive test coverage, making it easier to maintain and make changes without breaking other features.

### Added

- Influx in reading mode is now enabled
- Feature flag for hiding Influx
- Jest testing framework with comprehensive test coverage
- Support for tables in the parser
- Support for bullets inside callouts
- Frontmatter parsing with tests
- StructuredText implementation with stringify method
- Live update feature with configurable delay

### Changed

- Reimplemented core excerpt generation functions for better robustness
- Improved handling of nested callouts, ordered lists, different indentation levels, tables, and LaTeX blocks
- Major refactor of core logic (#14, #18)
- Delay show Influx after edit for better UX

### Fixed

- Workaround for text appearing below Influx component when typing (by hiding Influx while typing)
- Fixed preview to work with Markdown Links
- Fixed heading references in link comparison

## [2.0.7] - 2022-10-10

### Fixed

- Fixed minimal bug #30

## [2.0.6] - 2022-10-10

### Changed

- Updated styles
- Added top margin for Influx component (#34)

## [2.0.5] - 2022-10-10

### Changed

- Updated manifest

## [2.0.4] - 2022-10-09

### Added

- Sort by filename feature (#33)

### Fixed

- Fixed mark coloration bug
- Fixed dashes as bullets bug (#30)

## [2.0.3] - 2022-10-09

### Changed

- Updated createStyleSheet (#27)

## [2.0.2] - 2022-10-09

### Changed

- Minor style fixes

## [2.0.1] - 2022-10-08

### Changed

- Updated treeUtils (#25)
- Version bump to Obsidian v1
- Minor style fixes (#26)

## [2.0.0] - 2022-10-08

Major rewrite with React implementation and new features.

### Added

- Live update feature (#24)
- React-based component system
- Settings tab with configuration options
- shouldUpdate functionality for InfluxFile
- Comprehensive mobile support

### Changed

- Major refactor of core logic (#14, #18)
- Reimplemented collapse toggle
- Updated logo and branding
- Complete rewrite of main.tsx and InfluxReactComponent

### Fixed

- Fixed mobile version (issue #1)
- Fixed frontmatter bug (issue #13)
- Fixed callouts (issue #15)
- Fixed popout stylesheets
- Made title parsing more robust (bug #22)
- Fixed List Callouts bug
- Fixed link comparison

## [1.2.1] - 2022-09-29

### Changed

- Updated build workflow
- Updated styles

## [1.2.0] - 2022-09-29

### Changed

- Updated styles
- Updated GitHub Actions

## [1.1.2] - 2022-09-28

### Changed

- Updated apiAdapter

## [1.1.1] - 2022-09-28

### Added

- Option to disable page headings
- Influx in preview mode
- React components with live updates
- Settings tab with react-jss styling
- RegExp logic implementation

### Changed

- Major update to InfluxReactComponent
- Reimplemented styles with react-jss

### Fixed

- Fixed bug to display block links
- Disabled buggy footer in preview mode
- Fixed styles for preview
- Fixed width CSS
- Enabled buggy but working Influx in reading mode

## [1.1.0] - 2022-09-27

### Fixed

- Fixed checkboxes

## [1.0.8] - 2022-09-27

### Changed

- Updated InfluxReactComponent

## [1.0.7] - 2022-09-27

### Changed

- Updated release workflow

## [1.0.6] - 2022-09-27

### Changed

- Updated release workflow

## [1.0.5] - 2022-09-27

No changes recorded

## [1.0.4] - 2022-09-27

No changes recorded

## [1.0.3] - 2022-09-27

### Changed

- Updated styles

## [1.0.2] - 2022-09-27

### Changed

- Updated dependencies
- Updated release workflow

## [1.0.1] - 2022-09-27

### Added

- Initial dependency setup

### Fixed

- Multiple hotfix releases (1.0.1-fix-001 through 1.0.1-fix-004) to resolve dependency and build issues

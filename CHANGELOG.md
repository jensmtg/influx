# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

Thanks to kenlim for contributing to development through a pull request!

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

### Contributors

Thanks to kenlim for contributing to development through a pull request!

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

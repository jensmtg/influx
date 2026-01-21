# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Added

- Influx in reading mode is now enabled

### Changed

- Reimplemented core excerpt generation functions for better robustness
- Improved handling of nested callouts, ordered lists, different indentation levels, tables, and LaTeX blocks

### Fixed

- Workaround for text appearing below Influx component when typing (by hiding Influx while typing)

## Previous Releases

I need to explore these older releases and expand the Changelog with more information later.

- [ ] 2.1.1
- [ ] 2.1.0
- [ ] 2.0.7
- [ ] 2.0.6
- [ ] 2.0.6
- [ ] 2.0.4
- [ ] 2.0.3
- [ ] 2.0.2
- [ ] 2.0.1
- [ ] 2.0.0
- [ ] 1.2.1
- [ ] 1.2.0
- [ ] 1.1.2
- [ ] 1.1.0
- [ ] 1.0.8
- [ ] 1.0.7
- [ ] 1.0.5
- [ ] 1.0.4
- [ ] 1.0.2
- [ ] 1.0.1

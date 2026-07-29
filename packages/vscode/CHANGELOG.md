# Changelog

All notable user-visible changes to the VS Code extension are documented here.
Core-only changes remain in the root changelog.

## Unreleased

## 0.2.0 - 2026-07-29

### Added

- Added distinct `production` and `aggressive` profile settings and exposed
  table, reference, external-link, section-spacing, and compatibility template
  controls.

### Changed

- Bundled the expanded core formatter with parser-assisted template and table
  formatting, full-document equivalence, structured failures, and exact
  preservation of anonymous arguments and table-cell whitespace.
- Kept editor formatting safe by default: invalid configuration or a core
  safety warning produces a visible warning and no document edit.
- Updated extension documentation for VS Code compatibility, workspace config
  precedence, bundled-core behavior, limitations, and troubleshooting.
- Corrected the unsafe-setting documentation: disabling the additional safe
  pass still uses the core fail-closed base pipeline, but the compact API does
  not expose structured failures.
- Replaced duplicated core semantics with links to the focused core
  documentation hierarchy.

## 0.1.0

### Added

- Initial VS Code formatter wrapper.
- Format Document support for `wikitext` and compatible `mediawiki` language
  ids.
- Bundled `wikitext-fmt` runtime with safe formatting by default.
- Workspace configuration discovery and experimental formatter settings.

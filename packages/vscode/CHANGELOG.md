# Changelog

All notable user-visible changes to the VS Code extension are documented here.
Core-only changes remain in the root changelog.

## Unreleased

### Added

- Exposed the remaining editor-appropriate core options, with automated parity
  checks that classify every core option as either a VS Code setting or an
  explicit config-file-only option.
- Added document check and read-only diff preview commands, structured
  output-channel reports, resolved-configuration inspection, and opening the
  config file actually used by the active document.

### Changed

- Both safe and non-safe editor modes now use the core detailed result APIs and
  preserve structured failures and rule diagnostics. Any failure or warning
  remains fail-closed and produces no document edit.
- Limited all document commands to `wikitext` and compatible `mediawiki`
  documents in both contribution metadata and runtime checks.
- Marked `formatTemplateParameters` as deprecated in VS Code metadata and
  directs users to the unified template controls.

### Fixed

- Relative JSON and path-like `parserConfig` values loaded from configuration
  files now resolve from the configuration file directory instead of the
  extension host process working directory.

## 0.2.0 - 2026-07-30

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
- Raised the minimum supported VS Code version to 1.100 to match the extension's
  ES module runtime.
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

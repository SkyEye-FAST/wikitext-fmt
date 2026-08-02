# Changelog

All notable user-visible changes to the VS Code extension are documented here.
Core-only changes remain in the root changelog.

## Unreleased

## 0.4.0 - 2026-08-02

### Removed

- **Breaking (pre-1.0):** Removed the deprecated VS Code template-parameter
  compatibility setting. Use `wikitextFmt.formatTemplates` with the template
  spacing, layout, and line-width settings instead.
- **Breaking (pre-1.0):** Removed the `aggressive` profile. Existing users must
  switch to `production`, which now represents the mature automation preset.

### Added

- Added six `wikitextFmt.site.*` settings for API, parser config, snapshot,
  cache, TTL, and stale-cache policy, plus a trusted-workspace-only refresh
  command that never modifies project configuration.
- Added shared project/site resolution with snapshot-only untrusted-workspace
  behavior, default cache files under extension global storage, same-API request
  deduplication, fail-closed network/config handling, and complete site source,
  path, freshness, override, and namespace-conflict reporting.

- Localized all VS Code UI text to English, Simplified Chinese (zh-cn), and
  Traditional Chinese (zh-tw). Command titles, setting descriptions, and
  notifications now follow the active VS Code display language.
- Added `package.nls` manifest catalogs for all three locales with automated
  key-set and placeholder consistency tests.
- Added runtime `l10n/bundle.l10n.*.json` bundles using the native VS Code
  `vscode.l10n.t()` API for notification and dialog text.
- Added Chinese `enumDescriptions` for each enumerated configuration property
  so the VS Code Settings editor shows human-readable labels in all three
  languages.
- Added **Generate Site Parser Configuration** and **Check Site Parser
  Configuration** commands. They require a trusted workspace, confirm parser
  config overwrites, report semantic drift, clear generated configuration caches,
  and run an isolated post-generation smoke test.
- Added `.wikitext-fmt.json` to automatic workspace configuration discovery and
  site/parser-generation diagnostics to the extension report.

### Changed

- Replaced all hard-coded English strings in `src/extension.ts` with
  `vscode.l10n.t()` calls and parameterised interpolation (e.g., the diff
  preview title passes the file name as `{fileName}`).
- Updated `scripts/check-package-content.mjs` to verify that all three
  `package.nls` files and all three `l10n/bundle.l10n` files are included in
  the VSIX.
- Corrected the localized runtime spelling of `MediaWiki` and added source
  reference/orphan-key checks plus real zh-cn and zh-tw VSIX smoke coverage.
- Bundle core `wikitext-fmt` 0.8.1. The production profile now enables mature
  references, external links, expanded section spacing, and parser-confirmed
  interlanguage footer placement; it reports the new interlanguage footer
  diagnostics and skip reasons.

## 0.3.0 - 2026-07-31

### Added

- Exposed the remaining editor-appropriate core options, with automated parity
  checks that classify every core option as either a VS Code setting or an
  explicit config-file-only option.
- Added document check and read-only diff preview commands, structured
  output-channel reports, resolved-configuration inspection, and opening the
  config file actually used by the active document.
- Added complete list changes, skipped-line counts, core-named list diagnostics,
  and unified `lists: <reason>` entries to output-channel reports.
- Added extension-host coverage for CRLF check, preview, format, and save flows,
  plus mixed-EOL and bare-CR fail-closed behavior.

### Changed

- Both safe and non-safe editor modes now use the core detailed result APIs and
  preserve structured failures and rule diagnostics. Any failure or warning
  remains fail-closed and produces no document edit.
- Clean UTF-8 file documents are checked against their original bytes before
  VS Code normalizes the text model, preserving pure CRLF and rejecting mixed
  LF/CRLF or bare CR with `unsupported-line-endings`.
- Limited all document commands to `wikitext` and compatible `mediawiki`
  documents in both contribution metadata and runtime checks.
- Marked `formatTemplateParameters` as deprecated in VS Code metadata and
  directs users to the unified template controls.
- Clarified that VS Code Marketplace publication and core npm publication use
  independent release processes and version lifecycles.

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

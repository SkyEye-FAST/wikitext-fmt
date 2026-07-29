# Changelog

All notable user-visible changes to the core package and CLI are documented
here. The project follows the pre-1.0 policy in [VERSIONING.md](VERSIONING.md).

## Unreleased

## 0.2.0 - 2026-07-29

### Added

- Added `production` and `aggressive` profiles. Both use safe formatting by
  default in the CLI, while `--unsafe` remains an explicit development and
  benchmarking override.
- Added stable structured formatter failure codes, full-document semantic
  equivalence checks, and JSON diagnostics and batch reports.
- Added generated MediaWiki localization aliases, siteinfo and custom alias
  sources, configurable localized-syntax preservation or canonicalization, and
  alias inspection from the CLI.
- Added a production corpus workflow with executable manifests, content-model
  filtering, page and node coverage, precise skip reasons, churn statistics,
  diff gates, and deterministic parser-work assertions.
- Added release benchmark comparison and complete core, extension, and VSIX
  verification gates.
- Added `wikitext-fmt --version` and `-v`, sourced from package metadata, plus
  an offline version-consistency check.

### Changed

- Replaced separate template passes with one convergent parser-assisted engine
  supporting nested and multiline structures while preserving parameter order,
  anonymous values, and whitespace-sensitive parser-function content.
- Graduated parser-assisted table formatting to a normal-level rule enabled by
  default. Parser-confirmed inline cells can be split without reordering or
  rewriting cell content, including nested tables and tables in templates.
- Strengthened fail-closed verification with exact template and table
  fingerprints, bounded convergence checks, final document equivalence, and a
  second-pass idempotency check in safe mode.
- Protected parser-confirmed extension bodies, comments, explicit ignore
  regions, line-sensitive template values, and table-emitting `{{!}}`
  invocations from rules that do not understand them.
- Made high-cardinality structural identity checks, descendant checks,
  replacement application, and document prose masking linear or near-linear.
- Reorganized project, API, CLI, extension, versioning, and release
  documentation around the actual pre-1.0 contracts.

### Fixed

- Corrected structural-coverage denominators and separated page coverage from
  eligible-node coverage.
- Ensured anonymous template arguments and table-cell contents are compared and
  preserved exactly during structural verification.
- Excluded explicitly non-wikitext content models before formatting and report
  them separately instead of passing them to the parser.

## 0.1.0

### Added

- Initial parser-assisted formatter library and `wikitext-fmt` CLI development
  version.

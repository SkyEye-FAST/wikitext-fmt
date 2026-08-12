# Changelog

All notable user-visible changes to the core package and CLI are documented
here. The project follows the pre-1.0 policy in
[docs/versioning.md](docs/versioning.md).

## Unreleased

### Added

- Added parser-aware `<!-- wikitext-fmt-ignore -->` handling for the next
  formatting unit, including inline links, templates, tables, headings, and
  other parser-confirmed nodes. Added nesting-aware ignore regions and ensured
  marker-like text inside opaque extension blocks remains literal.

### Changed

- **Breaking (pre-1.0):** A single ignore marker followed only by whitespace
  and a supported parser node now ends at that node instead of conservatively
  swallowing the remainder of its paragraph. Plain text retains the paragraph
  fallback, and list-only content is limited to one line.

## 0.8.2 - 2026-08-13

### Fixed

- Fixed anonymous and mixed template layout selection so short parser-safe
  multiline invocations collapse inline according to `lineWidth`, while
  already-inline positional templates remain inline even when over width and
  over-width multiline invocations are no longer forcibly collapsed. Removed
  the fixed three-argument collapse limit while retaining exact anonymous-value
  preservation and structural verification.

## 0.8.1 - 2026-08-02

### Fixed

- Fixed the browser entry's bundled default parser configuration so
  parser-confirmed reference formatting and interlanguage footer placement
  match the Node entry. Browser interwiki classification now derives only from
  parser-produced link targets and the active parser configuration because the
  upstream browser bundle omits that node property.
- Added Node/browser parser-configuration and classification parity coverage,
  plus packed browser-consumer and Web Worker release smoke coverage for
  references and interlanguage links.

## 0.8.0 - 2026-08-02

### Added

- Added `formatProfiles`, `getFormatProfileOverrides`, and
  `resolveFormatProfile` as browser-safe public APIs from both the root and
  `wikitext-fmt/browser` entries. Settings UIs can now use the exact core
  profile definitions without duplicating them, and every resolution returns an
  independent value.

- Added `.wikitext-fmt.json` to shared CLI/VS Code automatic discovery after the
  established filenames.
- Added explicit, auditable Node/CLI/VS Code generation and semantic drift
  checking for MediaWiki CodeMirror parser ConfigData, with validated raw
  siteinfo, isolated bounded execution, atomic ConfigData/provenance writes, and
  no remote-code execution during normal formatting or site-data refresh.

- Added strict `ProjectConfig.site` support for MediaWiki API, parser config,
  reproducible snapshot, persistent cache, TTL, and opt-in stale-cache policy,
  with config-relative paths and stable schema-version-1 snapshot JSON.
- Added one Node project resolver shared by the CLI and VS Code wrapper. It
  implements snapshot/fresh-cache/network/stale-cache ordering, same-API request
  deduplication, in-process caching, parser ConfigData validation, atomic writes,
  sanitized source reporting, and local-namespace/interlanguage conflict
  diagnostics while keeping formatter calls synchronous and I/O-free.
- Added CLI `--site-snapshot`, `--refresh-site-configuration`,
  `--print-site-configuration`, and `--validate-site-configuration` modes plus
  site-resolution details in debug, JSON diagnostics, and batch reports.
- Added browser-safe project/snapshot validation, normalization, stable
  serialization, sanitization, and site-data apply helpers; Node-only loading
  and resolution remain excluded from the browser dependency graph.

### Changed

- Named and explicitly numbered templates that start on one line now prefer a
  parser-safe inline candidate whenever its final normalized length fits
  `lineWidth`; parameter count, redundant source whitespace, and short nested
  structures no longer force multiline output by themselves. Existing multiline
  and anonymous-template policies remain conservative and unchanged.
- Promoted `externalLinks`, `references`, and `sectionSpacing` from
  experimental to normal reliability. The production profile now enables all
  three, so production formatting may introduce new semantics-preserving
  whitespace changes in documents that were previously unchanged. **Breaking
  (pre-1.0):** external settings UIs must use the public profile helpers or
  migrate their copied production preset.
- Expanded section spacing to insert missing blank lines between level 2–6
  headings and adjacent lists, templates, tables, footer metadata, file links,
  behavior switches, comments, HTML/extensions, redirects, and other protected
  blocks while keeping consecutive headings together.
- Promoted `interlanguageLinks` to normal reliability and enabled its
  parser-confirmed footer placement in the production profile. Eligible links
  must be root-level, whole-line, unlabelled links classified as interwiki by the
  active parser session and authorized by `interlanguagePrefixes`; source order,
  duplicates, target bytes, and prefix spelling are preserved.
- Extended siteinfo loading to derive authoritative interlanguage prefixes from
  `interwikimap` entries marked `language` or `extralanglink`. Generic interwiki
  entries remain in the page body unless explicitly configured, and explicit
  CLI/config prefixes retain precedence.
- Added inspected, eligible, skipped, moved, and formatted interlanguage-link
  counters plus structured skip-reason histograms to detailed, CLI, batch, and
  VS Code diagnostics.
- Reframed the package and extension as parser-assisted, semantics-preserving
  MediaWiki wikitext formatters suitable for normal interactive and automated
  use while retaining fail-closed parsing, equivalence, convergence, and
  idempotency checks.

### Removed

- **Breaking (pre-1.0):** Removed the `aggressive` profile from the core, CLI,
  corpus scripts, and VS Code settings. Its mature behavior is now represented
  by `production`; external settings UIs must migrate saved `aggressive` values.
  The `experimental` reliability level remains available for future rules, but
  no current rule is classified at that level.

## 0.7.0 - 2026-08-02

### Fixed

- Normalized parser-confirmed table captions plus opener and row attribute
  spacing, and prevented split inline cell separators from creating trailing
  whitespace.
- Made `tableCellSeparatorStyle: "preserve"` retain only `||`/`!!` layout while
  continuing other safe table marker normalization.

### Removed

- **Breaking (pre-1.0):** Removed `formatTemplateParameters`, its
  template-parameter CLI flags, and the `templateParameters` rule metadata.
  Template formatting is now controlled only by `formatTemplates`,
  `inlineTemplateSpacing`, `templateParameterLayout`, and `lineWidth`.
- **Breaking (pre-1.0):** Removed `TemplateParameterDiagnostics`, legacy
  template counters, and the standalone template-parameter compatibility wrapper.
  Detailed results now use `templateDiagnostics` instead of
  `templateParameterDiagnostics`.

## 0.6.0 - 2026-08-01

### Added

- Added the public `wikitext-fmt/browser` package subpath with all formatter
  variants, browser-safe public types and helpers, the bundled default MediaWiki
  parser configuration, Web Worker-compatible packaging, Node-free bundle and
  package-content checks, and Node/browser result parity coverage.
- Added the structured `unsupported-parser-config` failure for browser callers
  that request arbitrary named or filesystem parser configurations; safe APIs
  retain the original source instead of throwing.
- Added packed external-consumer validation for browser-only TypeScript
  declarations and installed-package Worker bundles, including Node-dependency
  inspection and raw and gzip bundle-size reporting.

### Changed

- Refactored parser integration around one immutable session per formatter
  invocation, shared by safe-format passes, rule reparsing, and structural
  verification; consolidated browser-safe exports and removed internal Node
  forwarding modules without changing formatter behavior or public APIs.
- Captured the upstream browser parser and bundled configuration once during
  module initialization, restored the temporary global parser property, and
  isolated browser declarations from Node-owned parser and filesystem types.

## 0.5.0 - 2026-07-31

### Added

- Added public `ListDiagnostics` and `ListSkipReason` types, detailed
  parser-eligibility and skip-reason counters, and matching CLI JSON and batch
  summary fields.
- Added formatter-wide pure CRLF support. Parsing and all rules use an internal
  LF snapshot, then restore CRLF for accepted output; safe idempotency,
  standalone structural equivalence, CLI modes, and public table diagnostic
  offsets follow the original line-ending style.

### Changed

- Made list formatting parser-assisted and range-based. Valid mixed marker
  sequences and list items containing ordinary comments, templates, wikilinks,
  references, or inline HTML now normalize marker-adjacent ASCII layout while
  preserving every content and structure byte.
- Added a no-candidate list fast path, delayed parser context creation, and
  candidate-line structural range indexing without changing list eligibility.
- Standardized `listLinesSkipped` across detailed results, CLI JSON, and batch
  summaries so the counter clearly includes every skip reason.

### Fixed

- Stopped treating all protected placeholders as equivalent list content:
  ignore ranges, opaque blocks, Unicode separators, multiline or unclosed
  structures, and ambiguous marker boundaries remain fail-closed with specific
  diagnostics.
- Preserved precise `protected-block` and `ignore-range` list skip reasons even
  when a document has candidates but no root-level parser-confirmed list, without
  restoring full structured analysis to that fast path.
- Mixed LF/CRLF input and bare CR now fail closed with the stable
  `unsupported-line-endings` code instead of being silently normalized.

## 0.4.0 - 2026-07-30

### Changed

- Parser-confirmed ordinary template invocation names now use ASCII spaces
  instead of underscores by default, including recognized `subst:` and
  `safesubst:` calls. Parser functions, magic words, triple-brace parameters,
  dynamic names, and parameter content remain unchanged.

### Fixed

- Made nested multiline template formatting converge within one rule invocation
  by normalizing indentation left after collapsed parameter line breaks and
  revalidating changed semantic nodes before treating them as canonical.

## 0.3.0 - 2026-07-30

### Added

- Added the default-on normal-level `formatWikilinks` rule and
  `--no-format-wikilinks` switch. Eligible parser-confirmed internal page-link
  and redirect targets now use ASCII spaces instead of underscores in their
  page-title component while preserving labels, fragments, file options,
  category sort keys, and configured remote targets.
- Added focused wikilink diagnostics and corpus counters for inspected,
  eligible, changed, fragment-containing and excluded links, replaced
  underscores, and skip reasons.

### Fixed

- Kept parser-confirmed templates and magic words opaque while confirming table
  cell separators, so tables containing multiline template parameters or pipe
  escapes format completely and idempotently in one formatter call.
- Resolved parser-confirmed wikilink source ranges in one source-order traversal
  and applied replacements in one pass, avoiding quadratic formatting time on
  pages containing many links.

## 0.2.2 - 2026-07-30

### Changed

- Added `inlineTemplateSpacing` with `auto`, `compact`, and `spaced` modes so
  single-line named templates use one coherent brace/pipe/equals spacing style.
  The default `auto` mode uses deterministic syntax-whitespace cost, while
  multiline layout remains controlled separately by `templateParameterLayout`.
- Made anonymous template line width a soft constraint: short, structurally
  equivalent templates can collapse inline, while positional argument
  whitespace is never introduced to force multiline output.
- Added `templateParameterLayout` with `compact`, `flush`, and `indented`
  modes for multiline named and explicitly numbered parameters. The default is
  `flush`.

### Fixed

- Restricted heading and template boundary cleanup to parser-confirmed ASCII
  layout whitespace, preserving non-breaking, narrow no-break, ideographic, and
  other non-ASCII whitespace in titles, template names, named keys, and values.
- Normalized eligible `*`, `#`, `:`, and `;` list marker separators, including
  nested combinations, from zero, multiple, or tab spacing to exactly one ASCII
  space while keeping empty items free of trailing whitespace.
- Added the canonical layout space after standalone table data/header markers
  and around parser-confirmed cell attribute separators, without adding
  trailing whitespace to empty cells.

## 0.2.1 - 2026-07-29

### Fixed

- Made npm release recovery verify the exact published tarball integrity and
  shasum while accepting a missing registry `gitHead` when the artifact matches.
- Made post-publication npm registry verification tolerate temporary metadata
  propagation delays while remaining fail-closed on persistent conflicts.
- Allowed the verified npm tarball to be published from the detached tag
  checkout used by GitHub Actions without relying on pnpm branch checks.

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
- Added a maintainable `docs/` reference hierarchy and offline documentation
  consistency checks.
- Replaced the one-line CLI synopsis with structured, metadata-assisted
  `--help` output.
- Added separate GitHub Actions workflows for ordinary checks and core package
  releases, with npm Trusted Publishing through OIDC and protected-environment
  approval.
- Added fail-closed core release metadata, npm registry recovery, GitHub Release
  conflict, exact tarball content, checksum, and installed-package smoke checks.
- Added automated GitHub Release notes and assets derived from the matching core
  changelog section.

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
  documentation around implementation boundaries and the actual pre-1.0
  contracts.
- Clarified that the base formatter pipeline remains fail-closed and safe mode
  adds a second idempotency pass rather than enabling every safeguard.
- Separated normal development version checks from release-finalization
  metadata checks so an unpublished development version need not appear as a
  dated release.
- Reorganized `.gitignore` coverage for package artifacts, release artifacts,
  local package-manager state, and generated local corpora and reports.

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

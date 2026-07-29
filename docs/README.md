# Documentation

Choose the shortest path for what you are trying to do.

## CLI users

- [Getting started](getting-started.md) — install the package and safely format,
  check, diff, or write a first page.
- [CLI reference](cli.md) — all modes, options, conflicts, streams, exit
  statuses, diagnostics, reports, and siteinfo behavior.
- [Configuration](configuration.md) — every formatter option, profile,
  validated config file, and precedence rule.
- [Safety and diagnostics](safety-and-diagnostics.md) — understand fail-closed
  behavior, failure codes, protected syntax, and machine-readable output.
- [Formatting rules](rules.md) — exact transformations, eligibility, skips,
  diagnostics, and non-goals for every rule.

## API consumers

- [Getting started](getting-started.md) — install the npm dependency and call a
  safe API.
- [JavaScript API](api.md) — public exports, result shapes, formatter variants,
  structural equivalence, localization, and config helpers.
- [Safety and diagnostics](safety-and-diagnostics.md) — compare the base
  pipeline with the additional safe idempotency pass.
- [Versioning](versioning.md) — pre-1.0 compatibility expectations.

## MediaWiki administrators

- [Localization](localization.md) — built-in, siteinfo, and custom namespace,
  magic-word, behavior-switch, and image-option aliases.
- [Corpus and benchmarks](corpus-and-benchmarks.md) — build a read-only,
  content-model-aware site corpus and review formatter coverage and churn.
- [Configuration](configuration.md) — select parser configuration and
  site-specific formatter options.

## Extension users

- [VS Code extension guide](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/packages/vscode/README.md)
  — installation,
  language support, format on save, editor settings, config discovery, and
  troubleshooting.
- [Formatting rules](rules.md) — core semantics shared by the bundled
  formatter.
- [Safety and diagnostics](safety-and-diagnostics.md) — behavior behind editor
  warnings and no-edit fallbacks.

## Contributors and maintainers

- [Development](development.md) — repository layout, tests, corpus checks,
  extension checks, and change workflows.
- [Corpus and benchmarks](corpus-and-benchmarks.md) — production evidence and
  performance tooling.
- [Versioning](versioning.md) — version selection, component independence, and
  tag conventions.
- [Releasing](releasing.md) — preparation, artifact verification, publishing,
  post-release checks, and rollback notes.

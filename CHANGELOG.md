# Changelog

## Unreleased

- Normalize MediaWiki siteinfo through one shared conversion path and persist
  raw siteinfo separately from executable localization aliases in target
  corpora.
- Make corpus manifests executable configuration with explicit CLI precedence
  and `--no-manifest` isolation.
- Add structured formatter failure codes and final full-document semantic
  equivalence to safe mode while retaining compatibility warning text.
- Correct page structural-coverage denominators and add page/node coverage,
  byte/line churn, diff percentiles, largest diffs, and optional diff gates.
- Make the production and aggressive CLI profiles safe by default; add an
  explicit `--unsafe` development override.
- Add deterministic parser-work assertions and a release-only versioned
  timing/RSS benchmark comparison.
- Record MediaWiki page content models in corpus metadata, exclude
  non-wikitext models before tier sampling, and make the runner audit and skip
  explicitly non-wikitext pages instead of parsing or formatting them.
- Protect parser-confirmed extension bodies and comments from structural
  formatting, and preserve line-sensitive template values and table-emitting
  `{{!}}` invocations.
- Make high-cardinality structural identities, descendant checks, replacement
  application, and full-document prose masking linear or near-linear.
- Preserve anonymous template and parser-function argument values byte-for-byte,
  including leading/trailing and whitespace-only values.
- Compare anonymous arguments and table cell content exactly in structural
  equivalence checks.
- Remove the obsolete line-based table analyzer and exercise the parser-based
  production path throughout the table matrix.
- Report unique eligible/changed/canonical/ambiguous structural-node counts and
  enforce separate corpus coverage thresholds.
- Separate the graduated `production` profile from the extended `aggressive`
  profile.

- Replaced the separate simple-template and brace-count parameter passes with
  one convergent parser-assisted engine. Nested templates, parser functions,
  Unicode/numeric/anonymous/empty parameters, multiline values, links, refs,
  HTML, comments, and templates in table cells are supported.
- Graduated tables to a normal-level rule enabled by default. `auto` now splits
  every parser-confirmed multi-cell row; `preserve` is the explicit inline
  layout. Nested tables and tables embedded in template text run deepest-first.
- Added template and table structural-equivalence fingerprints to the safety
  gate, with fail-closed warnings and diagnostics.
- Added production/aggressive profiles, generated structural matrices, a
  production corpus runner and report, representative corpus coverage, and
  full core/extension/VSIX CI release gates.
- Expanded diagnostics for template coverage, convergence, precise skip
  reasons, table fallbacks, and equivalence verification.

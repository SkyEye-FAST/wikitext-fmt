# Changelog

## Unreleased

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

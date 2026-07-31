# Safety and diagnostics

The formatter has a fail-closed base pipeline and an optional additional
idempotency pass. “Safe” and “unsafe” are CLI compatibility names; they are not
a switch between all safeguards and no safeguards.

## Base formatter pipeline

`formatWikitextDetailedResult` performs these stages:

1. Classify input as no line endings, pure LF, pure CRLF, mixed, or bare CR.
2. Normalize pure CRLF to an internal LF snapshot; reject mixed or bare CR.
3. Create the configured parser and parse the internal snapshot.
4. Require the parser root to serialize exactly to that snapshot.
5. Run enabled rules. Templates and tables use bounded convergence and
   rule-specific structural fingerprints.
6. Protect opaque ranges before rules that do not understand those structures.
7. Parse and exactly round-trip the candidate output.
8. Compare final document semantic fingerprints.
9. Restore CRLF when required and return accepted output, or the exact original
   input with a structured failure.

Unexpected exceptions also fail closed. The compact `formatWikitext` calls this
pipeline and returns only its `formatted` string, so it can hide why the
original source was returned.

## Additional safe pass

`formatWikitextSafeDetailed` first runs the base detailed pipeline. If that
result has a warning or failure, it returns the original source. Otherwise it
runs the complete line-ending envelope and base pipeline again on the restored
accepted output and requires:

- no second-pass warning or failure; and
- second-pass output exactly equal to first-pass output.

Failure produces `idempotency`. `formatWikitextSafe` strips the detailed rule
fields but keeps `failure` and `warning`.

The CLI's `--safe` and the VS Code setting `wikitextFmt.safe: true` select this
additional pass. `--unsafe` and `wikitextFmt.safe: false` select the base
single-call path. They omit only the additional second call; input/output
parsing, round-trip verification, structural checks, convergence handling,
document equivalence, and original-source fallback still apply.

## Failure codes

| Code | Stage / meaning |
| --- | --- |
| `input-parse` | The configured parser could not parse input |
| `input-roundtrip` | Parsed input did not serialize byte-for-byte to the source |
| `unsupported-line-endings` | `input-normalization`: input mixes LF/CRLF or contains bare CR |
| `output-parse` | Candidate output could not be parsed and exactly round-tripped |
| `template-equivalence` | Template fingerprints changed |
| `table-equivalence` | Table fingerprints changed |
| `document-equivalence` | A final document fingerprint category changed |
| `idempotency` | The additional safe pass warned, failed, or changed output |
| `template-convergence` | Template formatting exceeded its bounded passes |
| `table-convergence` | Table formatting exceeded its bounded passes |
| `formatter-exception` | Parser configuration or another unexpected formatter operation threw |

`FormatFailure` contains `code`, an optional `stage`, and `message`. Every
failure returns the original input.

Pure CRLF output contains CRLF for both retained and formatter-created line
breaks. Public table diagnostic `start` and `end` offsets are mapped from the
internal LF snapshot back to original CRLF offsets, including exclusive range
ends and EOF. Line numbers are unchanged by normalization.

## Compatibility warnings

`warning` is human-readable compatibility text derived from failure state.
Warning wording is not a stable machine interface. Branch on `failure.code`.
Warnings do not make the CLI fail unless `--fail-on-warning` is selected.

## Rule diagnostics

Detailed results expose structured information for rules that need it:

- tables: inspected/eligible/changed/canonical/ambiguous counts, separator
  policy, fallback and per-line reasons;
- templates: structural nodes, candidate layouts, skips, convergence, and
  equivalence;
- footer metadata: moved/formatted/canonicalized categories, defaultsort,
  switches, and interlanguage links;
- redirect, file-link, wikilink, external-link, reference, and section-spacing
  counters;
- lists: parser-confirmed inspected/eligible/changed/canonical counts,
  mixed-marker, comment-bearing, and structured-content changes, plus a
  skip-reason histogram;
- structural equivalence decisions.

Simple heading, blank-line, and HTML void-tag normalization do not expose
dedicated diagnostic objects.

## JSON diagnostic records

`--diagnostics-json` writes one compact JSON object per input to stderr:

```json
{
  "file": "page.wiki",
  "changed": true,
  "failure": null,
  "warning": null,
  "summary": {},
  "tableDiagnostics": [],
  "listDiagnostics": {
    "listLinesInspected": 0,
    "listLinesEligible": 0,
    "listLinesChanged": 0,
    "listLinesAlreadyCanonical": 0,
    "listLinesSkipped": 0,
    "mixedMarkerLinesChanged": 0,
    "commentBearingLinesChanged": 0,
    "structuredContentLinesChanged": 0,
    "skipReasons": {}
  }
}
```

`summary` contains rule counters grouped around files, table lines and nodes,
templates, footer metadata, redirects, file/internal/external links, references,
lists, section spacing, and localization canonicalization. `tableDiagnostics`
contains the complete per-table records. `listDiagnostics` contains the
per-input list counters and skip reasons. Current list skip reasons distinguish
parser confirmation, marker-boundary ambiguity, Unicode separators, multiline
content, unclosed comments, ignore ranges, protected blocks, changed structure,
and candidates that cannot round-trip exactly.

Formatted text or diffs remain on stdout. JSON diagnostics cannot be combined
with `--debug`.

## Batch reports

`--report <path>` writes:

- `files`: the same per-input diagnostic records;
- `summary.files`, `changedFiles`, and `warningFiles`;
- a failure-code histogram;
- aggregate rule and canonicalization counters;
- aggregate formatted and skipped table-line counts.

Report writing happens after input processing. A write error uses stderr and
exit 2. The report schema is pre-1.0 and may change in a documented minor
release; additions are preferred where practical, but consumers must not
assume stability yet.

## Protected blocks

Rules use placeholders to keep opaque source ranges exact. Protected extension
tags are:

```text
nowiki pre syntaxhighlight source templatedata math chem ref gallery
```

Depending on the rule, protection also covers comments, reference tags, tables,
parser-confirmed extension ranges, or additional parser ranges. Nested
protection ranges are merged and restored byte-for-byte.

Protection is rule-specific: templates, tables, refs, links, HTML, and comments
may be understood by one rule and opaque to another.

The list rule runs against parser-confirmed source before the shared placeholder
pass, so it can distinguish real inline comments and structures from opaque
blocks. It rejects edits whose ranges intersect ignore or protected blocks;
accepted source is then protected before later rules run.

## Ignore markers

Range ignore:

```wikitext
<!-- wikitext-fmt-ignore-start -->
content left unchanged
<!-- wikitext-fmt-ignore-end -->
```

An unclosed start marker protects to end of file.

Single-block ignore:

```wikitext
<!-- wikitext-fmt-ignore -->
== Heading left unchanged ==
```

It protects the next heading, category/interlanguage-like line, or
paragraph-like block until a blank line. Range ignore is preferred for complex
content.

## Exact round-trip limitations

The parser is an untrusted boundary. Pure LF, pure CRLF, and single-line input
without an EOL are supported. Pure CRLF uses an internal LF parser snapshot and
is restored after formatting, equivalence checks, and the additional safe pass.
Mixed LF/CRLF and bare CR fail closed with `unsupported-line-endings`; the
formatter does not silently choose a style or rewrite the file.

Other inputs whose parse tree cannot serialize exactly—including some malformed
syntax or parser-tokenization cases—are preserved. Genuinely ambiguous or
unbalanced boundaries are not guessed. Site-specific template semantics, Lua
module behavior, and custom grammar cannot be inferred from source spelling
alone; choose an appropriate parser config and localization data.

## Streams and automation

- formatted text/diffs: stdout;
- warnings/debug/JSON diagnostics/errors: stderr;
- batch report: requested file.

For automation over unfamiliar pages, use an idempotency-checking path,
`--check`, and `--fail-on-warning`, then review diagnostics before `--write`.

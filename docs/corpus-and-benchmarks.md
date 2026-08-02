# Corpus and benchmarks

The corpus tools provide read-only production evidence. Generated reports are
review artifacts and are ignored by Git unless a specific baseline is
intentionally tracked.

## Build a target corpus

The builder supports MediaWiki XML or API input.

XML:

```sh
pnpm corpus:build -- \
  --xml pages.xml \
  --output corpus-medium \
  --tier medium \
  --namespaces 0,10 \
  --seed release-1
```

API with a title list:

```sh
pnpm corpus:build -- \
  --api https://wiki.example/w/api.php \
  --titles titles.txt \
  --output corpus-small \
  --tier small
```

API all-pages mode uses MediaWiki continuation and requires namespace filters.
API calls are `GET` requests and the tool never edits wiki pages.

The output directory must be empty. Tiers default to:

| Tier | Maximum selected pages |
| --- | ---: |
| `small` | 100 |
| `medium` | 5,000 |
| `full` | all eligible pages |

`--max-pages` can further limit selection.

## Filtering and deterministic sampling

The builder:

- filters requested namespaces;
- applies repeatable title/content exclusion expressions;
- records each page's MediaWiki `contentModel`;
- excludes non-`wikitext` models before tier sampling;
- ranks eligible pages deterministically with SHA-256 over seed and title.

Metadata records page/revision IDs, timestamp, namespace, content model, byte
count, SHA-256, source filename, and XML/API source kind.

## Manifests

`manifest.json` records schema version, source, tier, seed, namespace filters,
selection counts, bytes, content-model distribution, `readOnly: true`, parser
configuration, page metadata, raw siteinfo, and normalized localization alias
paths.

When a runner directory has a manifest, its parser config and normalized
aliases become executable defaults. Explicit runner flags win.
`--no-manifest` isolates a run from manifest configuration. Missing or malformed
referenced metadata is an error.

## Run a corpus

The committed corpus runs both profiles:

```sh
pnpm corpus
```

Run another corpus directly:

```sh
node scripts/run-corpus.mjs corpus-medium \
  --profile production \
  --parser-config zhwiki \
  --siteinfo metadata/localization-aliases.json \
  --output corpus-production-report.json
```

`--siteinfo` expects normalized aliases, not a raw siteinfo response. Imported
pages explicitly marked with another content model are counted and skipped
without parsing. Legacy page metadata without a model is counted as assumed
wikitext.

## Coverage

Reports separate:

- pages with/without structural nodes;
- eligible and covered structural pages;
- eligible, changed, canonical, and ambiguous template/table nodes;
- inspected, eligible, changed, fragment-containing and excluded wikilinks,
  replaced underscores, and wikilink skip reasons;
- page structural coverage;
- template/table page coverage;
- eligible-node coverage.

Node coverage is `(changed + alreadyCanonical) / eligible`. A corpus with no
eligible nodes reports `null`; a positive threshold then fails.

The repository scripts require 100% eligible template and table node coverage
for the committed corpus:

```sh
pnpm corpus:production
pnpm corpus:aggressive
```

The production gate exercises all mature normal rules. The aggressive gate adds
experimental interlanguage-footer placement, so the two reports measure
different formatting policies under the same parse, equivalence, convergence,
and idempotency requirements.

## Skip reasons and failures

Ambiguous structural skips fail by default. A reviewed exact limitation can be
admitted with repeatable `--allow-skip-reason` values. Reports distinguish all
skip frequencies and unexplained reasons.

The runner exits 1 for formatter warnings, parse failures, idempotency,
equivalence or convergence failures, unexplained skips, or failed thresholds.
Use `--progress` for per-page progress on long runs.

## Churn and timing

Reports include:

- lines and bytes before/after;
- changed lines and bytes;
- total, p50, p95, p99, and maximum diff ratios;
- largest diffs and pages;
- line-ending-only and trailing-whitespace-only pages;
- structural changes;
- namespace/content-model distributions;
- total and percentile timing plus slowest pages.

Optional churn gates are:

```text
--max-p95-diff-ratio
--max-single-page-diff-ratio
```

Both accept values from 0 through 1 and have no default.

## Structural benchmark

```sh
pnpm benchmark
```

The benchmark generates:

- 10 KB, 100 KB, and 1 MB prose pages;
- 10, 100, and 500 template/table matrices;
- depth-50 nesting;
- tables inside templates;
- false table openers inside protected content.

It records parser contexts, source bytes parsed, formatting passes, candidate
work, equivalence timing, total timing, memory, warnings/failures, and semantic
node counts. Use its `--case` substring filter and `--output` JSON path for
focused investigation.

CI relies on deterministic parser-work and complexity assertions rather than
machine-sensitive wall-clock ceilings.

## Versioned benchmark comparison

```sh
pnpm benchmark:release
```

This writes a current report, compares it with
`benchmarks/structural-baseline.json`, and writes a comparison report with
formatting-time and RSS ratios. Optional maximum ratios can fail the comparison.
The baseline is intentionally tracked; current and comparison reports are not.

## Generated files

The repository ignores:

```text
corpus-report.json
corpus-*-report.json
benchmark-current-report.json
benchmark-comparison-report.json
```

Do not commit private corpora, downloaded dumps, credentials, or ordinary
generated reports. Commit a benchmark baseline or real-page fixture only when
it is an intentional, reviewed regression artifact.

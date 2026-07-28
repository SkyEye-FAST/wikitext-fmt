# wikitext-fmt

`wikitext-fmt` is a production-oriented, standalone structural formatter for MediaWiki wikitext. It uses [`wikiparser-node`](https://github.com/bhsd-harry/wikiparser-node) to discover and validate structure, but it is not a MediaWiki extension and does not require a running MediaWiki installation.

Eligible parser-confirmed templates and tables are formatted aggressively by default. Nested templates, parser functions, structured parameter values, nested tables, tables embedded in template text, attributes, captions, continuation lines, HTML, refs, comments, and links are supported without reordering semantic content. Protected extension blocks and explicit ignore regions remain unchanged. A structure is preserved when parser boundaries are demonstrably ambiguous or when changing its layout would alter whitespace-sensitive anonymous arguments; diagnostics report parser limitations precisely.

It does not perform site-specific semantic rewrites: parameters, rows, cells, attributes, categories, titles, and values are never reordered or translated. HTML5-style `<br>` remains the default rather than XHTML-style `<br />`.

## Install and build

Supported runtimes are Node.js 22.13+ on the 22.x line, or Node.js 24.11+. pnpm is required.

```sh
pnpm install
pnpm build
```

## CLI

```sh
wikitext-fmt page.wiki
wikitext-fmt page.wiki --write
wikitext-fmt page.wiki --check
cat page.wiki | wikitext-fmt --stdin
wikitext-fmt page.wiki --safe --level safe
wikitext-fmt page.wiki --debug
wikitext-fmt "pages/**/*.wiki" --check
wikitext-fmt "pages/**/*.wiki" --write
wikitext-fmt page.wiki --profile production
wikitext-fmt page.wiki --profile production --unsafe
wikitext-fmt page.wiki --diff
wikitext-fmt page.wiki --diagnostics-json --check
wikitext-fmt page.wiki --safe --check --fail-on-warning
wikitext-fmt "pages/**/*.wiki" --check --report report.json
wikitext-fmt page.wiki --localization-source siteinfo --site-api https://wiki.example/w/api.php
wikitext-fmt --print-localization-aliases --localization-source builtin
```

### Production usage profiles

The `production` and `aggressive` CLI profiles run with the full safety gate by
default. A file
that would change or any file that falls back with a warning makes the command
fail:

```sh
wikitext-fmt "pages/**/*.wiki" --profile production --check --fail-on-warning
```

After that check is clean, apply the same profile and retain a machine-readable
batch report:

```sh
wikitext-fmt "pages/**/*.wiki" --profile production --write --report report.json
```

`production` enables the graduated normal-level rules, including unified
template normalization and aggressive table splitting. `aggressive` extends it
with the still-validating reference, external-link, and section-spacing rules.
Both profiles use template, table, and final full-document structural
equivalence plus idempotency verification. `--unsafe` is an explicit
development/benchmark override; it is never selected implicitly for a
production/aggressive `--write`. Individual formatter options can still
override either preset:

```sh
wikitext-fmt "pages/**/*.wiki" --profile production \
  --no-format-external-links --check --fail-on-warning
```

For a site with custom namespace, magic-word, or image-option aliases, load
them from MediaWiki siteinfo:

```sh
wikitext-fmt "pages/**/*.wiki" --safe --check --fail-on-warning \
  --localization-source siteinfo --site-api https://wiki.example/w/api.php
```

Warnings mean the formatter rejected its candidate output (or could not safely
parse the input) and returned the original source unchanged. In CI, use
`--fail-on-warning`; use `--diagnostics-json` for one JSON record per input on
stderr, or `--report` for one aggregate JSON file. Formatted text and diffs stay
on stdout, so diagnostic output does not corrupt either stream.

Without `--write`, formatted wikitext is written to stdout. `--check` writes nothing and exits with status 1 when a file would change. Available switches are:

```text
--write
--check
--stdin
--safe
--unsafe
--debug
--diff
--diagnostics-json
--fail-on-warning
--report <path>
--config <path>
--no-config
--profile default|production|aggressive
--level safe|normal|experimental
--html-void-tag-style html5|xhtml|preserve
--parser-config <name-or-json-path>
--no-format-headings
--no-format-templates
--format-template-parameters
--no-format-template-parameters
--no-format-categories
--no-format-lists
--no-format-file-links
--format-external-links
--no-format-external-links
--format-references
--no-format-references
--format-interlanguage-links
--no-format-interlanguage-links
--interlanguage-placement preserve|footer
--interlanguage-prefixes en,ja,zh
--format-section-spacing
--no-format-section-spacing
--no-format-redirects
--no-format-behavior-switches
--behavior-switch-placement preserve|footer
--localization-source builtin|siteinfo|custom
--site-api <url>
--localized-syntax-style preserve|canonical-english
--print-localization-aliases
--format-tables
--no-format-tables
--table-cell-separator-style auto|split|preserve
--no-normalize-blank-lines
```

Explicit files and glob patterns can be mixed. Expanded paths are deduplicated and processed in stable sorted order. Directories are not formatted, and an unmatched glob exits with status 2 and a clear error.

`--diff` writes unified diffs to stdout without modifying files and exits with status 1 when formatting would change the input. Diffs use three context lines by default and separate distant changes into multiple hunks. It works with file paths, globs, and `--stdin` (labelled `stdin`), and cannot be combined with `--write`.

`--diagnostics-json` writes one JSON object per input to stderr. Each object includes `file`, `changed`, the structured `failure` (including `failure.code`), compatibility `warning`, table counters, footer counters (`behaviorSwitchesMoved`, `behaviorSwitchesFormatted`, `defaultsortMoved`, `categoriesMoved`, `interlanguageLinksMoved`, and `interlanguageLinksFormatted`), redirect counters (`redirectsFormatted`), file-link counters (`fileLinksFormatted`), external-link counters, reference counters, section-spacing counters, template-parameter counters, canonicalization counters (`localizedCategoryAliasesCanonicalized`, `localizedDefaultsortAliasesCanonicalized`, `localizedBehaviorSwitchesCanonicalized`, `localizedRedirectAliasesCanonicalized`, `localizedFileNamespaceAliasesCanonicalized`, and `localizedImageOptionsCanonicalized`), and complete table diagnostics. Formatted text or diffs remain on stdout. JSON diagnostics cannot be combined with the text-oriented `--debug` mode.

`--safe` explicitly enables parse-before, parse-after, structural-equivalence,
and idempotency verification; it is already the CLI default for the
`production` and `aggressive` profiles. `--unsafe` selects the single-pass path
for development and benchmarking, and cannot be combined with `--safe`.
Template fingerprints compare names, nesting, parameter order,
anonymous/named state, keys, and opaque values. Table fingerprints compare
nesting, attributes, captions, rows, cell counts/types/attributes, and opaque
contents. The final document fingerprint additionally covers links, files,
external links, refs, categories, DEFAULTSORT, redirects, headings, behavior
switches, interlanguage links, extension/HTML nodes, and ordinary prose. If
verification fails, the original input is returned with a stable
`failure.code`; `warning` remains as compatibility text. `--debug` writes the
selected mode, rule level, and result status to stderr without contaminating
formatted stdout.

`--fail-on-warning` changes warning handling only: if any input falls back with a formatter warning, the CLI exits non-zero. This is useful with `--safe --check`; warnings do not affect the exit code by default.

`--report <path>` writes one JSON batch report after all inputs are processed. It contains each file's `changed`, `failure`, `warning`, summary, and table diagnostics plus aggregate failure-code, file, table, footer, redirect, and canonicalization counts. Reports never share stdout with formatted text or diffs and are compatible with normal output, `--check`, `--diff`, `--write`, and `--stdin`. The report schema is experimental before 1.0; changes should be additive where practical, but consumers should not treat it as stable yet.

`--print-localization-aliases` resolves the configured alias source and prints the final alias JSON to stdout without formatting input files. With `--localization-source siteinfo`, it requires `--site-api`.

Formatting levels are cumulative:

| Level          | Enabled rules                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `safe`         | Heading spacing, blank-line normalization, and ordinary HTML void-tag normalization                                         |
| `normal`       | Safe rules, complex parser-assisted templates and tables, redirects, file links, page-footer metadata, behavior switches, and list spacing |
| `experimental` | Safe and normal rules plus explicitly enabled experimental rules                                                            |

The default is `normal`. Unified template formatting and aggressive `auto`
table splitting are normal-level rules and tables are enabled by default.
`formatTemplateParameters` remains as a deprecated pre-1.0 compatibility alias
that routes to the same template engine. External links, references,
interlanguage links, and section spacing remain explicit experimental rules;
the aggressive profile enables the relevant set together.

The default parser configuration name is `mediawiki`, which maps to `wikiparser-node`'s generic `default` configuration. Names shipped by the parser, such as `enwiki` or `zhwiki`, and paths to custom JSON configurations are also accepted.

## Configuration files

The CLI searches from the current working directory upward for the first supported JSON configuration file:

```text
.wikitextfmtrc
.wikitextfmtrc.json
wikitext-fmt.config.json
```

Use `--config <path>` to select a file explicitly or `--no-config` to disable discovery. The precedence is:

```text
CLI options > explicit --config file > discovered config file > defaults
```

Configuration keys match `FormatOptions`:

```json
{
  "profile": "default",
  "parserConfig": "mediawiki",
  "lineWidth": 120,
  "level": "normal",
  "htmlVoidTagStyle": "html5",
  "formatHeadings": true,
  "formatTemplates": true,
  "formatTemplateParameters": false,
  "formatCategories": true,
  "formatLists": true,
  "formatFileLinks": true,
  "formatExternalLinks": false,
  "formatReferences": false,
  "formatInterlanguageLinks": false,
  "interlanguagePlacement": "preserve",
  "interlanguagePrefixes": ["en", "ja", "zh"],
  "formatSectionSpacing": false,
  "formatRedirects": true,
  "formatBehaviorSwitches": true,
  "behaviorSwitchPlacement": "preserve",
  "localizationSource": "builtin",
  "localizedSyntaxStyle": "preserve",
  "localizationAliases": {
    "categoryNamespaces": ["Project category"],
    "fileNamespaces": ["Project file"],
    "defaultsortMagicWords": ["PROJECTSORT:"],
    "redirectMagicWords": ["#PROJECTREDIRECT"],
    "imageOptionAliases": {
      "img_thumbnail": ["projectthumb"],
      "img_right": ["projectright"]
    },
    "behaviorSwitches": {
      "notoc": ["__PROJECTNOTOC__"]
    }
  },
  "formatTables": true,
  "tableCellSeparatorStyle": "auto",
  "normalizeBlankLines": true
}
```

Unknown keys and invalid option values are rejected instead of being silently ignored. Configuration discovery and loading are CLI concerns; the formatter core does not read files or inspect the working directory.

## VS Code extension wrapper

An initial VS Code wrapper lives in `packages/vscode`. It contributes the `wikitext` language id for `.wiki`, `.wikitext`, and `.mediawiki` files, registers Format Document providers for `wikitext` and `mediawiki`, and calls the existing formatter core API. The `mediawiki` formatter registration is compatibility support for users who already have another extension contributing that language id. The VSIX build is bundled and carries the minimum `wikiparser-node` parser config assets required at runtime under `dist/node_modules/`, so it does not rely on workspace dependencies after installation. This wrapper does not include syntax highlighting, an LSP server, or siteinfo fetching. Packaging metadata is included, but publishing is intentionally manual.

Build it with:

```sh
pnpm --filter wikitext-formatter typecheck
pnpm --filter wikitext-formatter build
pnpm --filter wikitext-formatter test
pnpm --filter wikitext-formatter test:extension
pnpm --filter wikitext-formatter test:vsix
pnpm --filter wikitext-formatter check:release
pnpm --filter wikitext-formatter vscode:package
```

The extension package has its own README at `packages/vscode/README.md`.

The extension command is:

```text
wikitext-fmt.formatDocument
```

Supported settings are:

```json
{
  "wikitextFmt.safe": true,
  "wikitextFmt.config.enabled": true,
  "wikitextFmt.config.path": null,
  "wikitextFmt.profile": "default",
  "wikitextFmt.level": "normal",
  "wikitextFmt.htmlVoidTagStyle": "html5",
  "wikitextFmt.formatTables": true,
  "wikitextFmt.formatReferences": false,
  "wikitextFmt.formatExternalLinks": false,
  "wikitextFmt.formatSectionSpacing": false,
  "wikitextFmt.formatTemplateParameters": false
}
```

The VS Code wrapper can reuse the same `.wikitextfmtrc`, `.wikitextfmtrc.json`, and `wikitext-fmt.config.json` files as the CLI. Explicit VS Code settings override config-file values for the settings exposed by the extension. Untitled documents use VS Code settings only.

Use VS Code's Format Document command, or enable format-on-save for wikitext files:

```json
{
  "[wikitext]": {
    "editor.defaultFormatter": "skyeyefast.wikitext-formatter",
    "editor.formatOnSave": true
  },
  "[mediawiki]": {
    "editor.defaultFormatter": "skyeyefast.wikitext-formatter",
    "editor.formatOnSave": true
  }
}
```

## API

```ts
import {
  formatWikitext,
  formatWikitextSafe,
  loadSiteInfoAliases,
} from "wikitext-fmt";

const output = formatWikitext(source, {
  profile: "default",
  parserConfig: "mediawiki",
  lineWidth: 120,
  formatHeadings: true,
  formatTemplates: true,
  formatTemplateParameters: false,
  formatCategories: true,
  formatLists: true,
  formatFileLinks: true,
  formatExternalLinks: false,
  formatReferences: false,
  formatInterlanguageLinks: false,
  interlanguagePlacement: "preserve",
  interlanguagePrefixes: ["en", "ja", "zh"],
  formatSectionSpacing: false,
  formatRedirects: true,
  formatBehaviorSwitches: true,
  behaviorSwitchPlacement: "preserve",
  localizationSource: "builtin",
  localizedSyntaxStyle: "preserve",
  formatTables: true,
  tableCellSeparatorStyle: "auto",
  normalizeBlankLines: true,
  level: "normal",
  htmlVoidTagStyle: "html5",
});

const result = formatWikitextSafe(source);
if (result.failure) {
  console.warn(result.failure.code, result.warning);
}
console.log(result.formatted);

const siteAliases = await loadSiteInfoAliases("https://wiki.example/w/api.php");
const siteOutput = formatWikitext(source, {
  localizationSource: "siteinfo",
  localizationAliases: siteAliases,
});
```

For API use, `localizationSource: "siteinfo"` means “use aliases that were loaded from siteinfo.” The formatter core does not fetch network data; call `loadSiteInfoAliases()` first and pass the result as `localizationAliases`. If `siteinfo` is selected without aliases, formatting fails closed with a warning. The CLI performs this loading when `--localization-source siteinfo --site-api <url>` is used.

`formatWikitext()` remains the compact string-returning API.
`formatWikitextResult()` exposes warnings without running the additional
idempotency pass. `formatWikitextSafeDetailed()` performs the same input parse,
output parse, and second-pass idempotency verification as
`formatWikitextSafe()`, while also returning rule diagnostics. Every safe-mode
failure returns the original source with a structured `FormatFailure` and a
derived compatibility warning.

## Rule reliability

Every current rule has an exported reliability level in `ruleLevels`:

- `headings`: `safe`
- `blankLines`: `safe`
- `templates`: `normal`
- `templateParameters`: `experimental`
- `categories`: `normal`
- `lists`: `normal`
- `fileLinks`: `normal`
- `externalLinks`: `experimental`
- `references`: `experimental`
- `interlanguageLinks`: `experimental`
- `sectionSpacing`: `experimental`
- `redirects`: `normal`
- `behaviorSwitches`: `normal`
- `htmlVoidTags`: `safe`
- `tables`: `normal`

`htmlVoidTagStyle` controls only simple, attribute-free `br`, `hr`, and `wbr` tags. Its default, `html5`, changes `<br />` to `<br>`. Use `xhtml` for `<br />` output or `preserve` to leave existing syntax unchanged. MediaWiki extension tags such as `<ref />` and `<references />` are never handled by this rule.

The levels describe formatter confidence. Template and table transformations additionally require structural fingerprints to match. Use an appropriate parser configuration and `formatWikitextSafe()` for automation over unfamiliar pages.

## Production corpus runner

Run every committed real-page fixture through both production profiles and
write profile-specific JSON reports:

```sh
pnpm corpus
node scripts/run-corpus.mjs path/to/pages --profile production \
  --parser-config zhwiki --siteinfo localization-aliases.json --output report.json
```

When `<corpus>/manifest.json` exists, the runner automatically applies its
parser config and normalized localization aliases. Explicit runner flags take
precedence; `--no-manifest` uses isolated defaults. Namespace, tier, and source
fields are retained as report metadata and do not change corpus selection or
execution. A referenced missing or malformed metadata file is a hard error.

The report includes pages processed/changed, structured failure codes, parse,
idempotency, equivalence and convergence failures, unique template/table node
counts, separate page/node coverage, content-model distribution, and precise
skip-reason frequencies. Builder metadata records each page's MediaWiki
`contentModel`. Only `wikitext` pages are selected for a newly built formatter
corpus; the manifest records excluded non-wikitext pages. As a second guard,
the runner never parses or formats an imported page explicitly marked with
another content model, and reports it under `pagesSkippedNonWikitext` and
`nonWikitextSkips`. Legacy metadata without a model is counted under
`pagesAssumedWikitext`. Use `--progress` for per-page progress on long runs.
Page structural coverage is
`pagesStructurallyCovered / pagesWithStructuralNodes`; pages without template
or table nodes are reported separately and excluded from that denominator.
Node coverage is
`(changed + alreadyCanonical) / eligible`. Use `--min-template-coverage` and
`--min-table-coverage` to enforce a measured baseline. Ambiguous skips fail by
default; a reviewed exact limitation can be admitted with
`--allow-skip-reason`. The measured committed-corpus thresholds are 100% for
both eligible template and eligible table nodes, with no admitted skip reason.
Coverage is reported as `null`, and a positive threshold fails, when a corpus
contains no eligible nodes of that structure.

Build a read-only target-wiki corpus from a MediaWiki XML dump or an API title
list before running the report:

```sh
pnpm corpus:build -- --xml pages.xml --output corpus-medium --tier medium \
  --namespaces 0,10 --seed release-1
pnpm corpus:build -- --api https://wiki.example/w/api.php \
  --titles titles.txt --output corpus-small --tier small
node scripts/run-corpus.mjs corpus-medium --profile production --output report.json
```

The builder performs only local reads and MediaWiki API `GET` requests; it
never edits pages. `small`, `medium`, and `full` tiers default to 100, 5,000,
and all matching pages respectively. `--max-pages`, namespace filters,
seeded deterministic sampling, repeatable title/content exclusion regexes,
explicit parser configuration, and external siteinfo are supported. Raw
siteinfo is stored as `metadata/siteinfo.raw.json`; the exact normalized
`FormatOptions.localizationAliases` value is stored separately as
`metadata/localization-aliases.json`. Sources, page metadata, hashes, parser
config, content models, and localization metadata are referenced by the
executable manifest. Scribunto, JSON, CSS, JavaScript, and other non-wikitext
content models are counted but excluded before deterministic tier sampling.
Corpus reports include bytes and lines before/after, changed lines/bytes,
per-page and p50/p95/p99 diff ratios, largest diffs, line-ending-only and
trailing-whitespace-only changes, structural changes, namespace distribution,
coverage, skip frequencies, timing percentiles, and the largest and slowest
pages. Optional churn gates are `--max-p95-diff-ratio` and
`--max-single-page-diff-ratio`; neither has a default.

## List formatting

The normal-level list rule handles ordinary single-line items beginning with combinations of `*`, `#`, `:`, and `;`. It adds one missing space after the marker sequence and removes trailing horizontal whitespace. Existing spacing, blank lines, nesting markers, and definition-list structure remain intact.

List lines containing templates, table syntax, wikilinks, HTML, or extension tags are preserved unchanged. Protected blocks such as `nowiki`, `pre`, and `syntaxhighlight` are never inspected by this rule. Disable it with `--no-format-lists` or `formatLists: false`.

## Redirect formatting

The normal-level redirect rule handles only a redirect on the first non-empty page line. It is parser-assisted when `wikiparser-node` exposes redirect structure, with the existing conservative line-level alias and target checks kept as a fallback for custom or siteinfo aliases. It recognizes the selected localization data's `redirect` magic-word aliases and normalizes spacing from `#REDIRECT[[Target]]` to `#REDIRECT [[Target]]`.

With `localizedSyntaxStyle: "preserve"`, the original alias spelling is kept, such as `#転送 [[Target]]`. With `"canonical-english"`, recognized localized aliases are emitted as `#REDIRECT [[Target]]`, and `localizedRedirectAliasesCanonicalized` is incremented when the keyword changes.

The rule is intentionally narrow. It skips redirect-like lines that are not first non-empty content, have unbalanced links, include templates in the target, contain multiple links, have trailing text or comments, or include HTML on the same line. Disable it with `--no-format-redirects` or `formatRedirects: false`.

## File and image link formatting

The normal-level file-link rule handles only one simple file/image link occupying a whole line, such as:

```wikitext
[[File:Example.png|thumb|right|300px|alt=Example]]
```

It recognizes File namespace aliases and image option aliases from the selected localization data. File namespace matching normalizes underscores to spaces and compares aliases case-insensitively, while preserving the original namespace spelling in `localizedSyntaxStyle: "preserve"` mode. Preserve mode keeps option spelling and only trims trailing horizontal whitespace when the line is otherwise safe.

In `"canonical-english"` mode, the rule rewrites only certainly matched syntax keywords: localized File namespace aliases become `File`, and recognized image options such as localized `thumb`, `right`, `left`, or `center` become their canonical English option names. File names, captions, alt text values, link targets, page numbers, class/lang values, widths such as `300px`, and normal text are not translated or reordered.

File/image link formatting is parser-assisted: `wikiparser-node` identifies whole-line file-link nodes where possible, and a conservative whole-line source fallback remains for custom or site-provided aliases that the parser configuration may not know. The rule skips inline file links, lines with multiple wikilinks, nested links, templates, parser-function-like syntax, HTML or extension tags, multiline links, gallery contents, and table lines. Disable it with `--no-format-file-links` or `formatFileLinks: false`.

## Experimental reference formatting

Reference formatting is experimental and disabled by default:

```sh
wikitext-fmt page.wiki --level experimental --format-references
```

The rule only normalizes standalone self-closing reference-related lines:

```wikitext
<references/>
<references group="note"/>
<ref name="foo"/>
```

become:

```wikitext
<references />
<references group="note" />
<ref name="foo" />
```

Reference formatting is parser-assisted: `wikiparser-node` identifies standalone extension nodes, and the rule then keeps a source-line safety check because exact self-closing syntax matters. Attributes are preserved exactly apart from spacing before `/>`; attribute order, quote style, and values are not normalized. Content-bearing refs, inline refs, multiline refs, lines with multiple tags, templates, wikilinks, comments, table/list syntax, non-reference HTML, protected placeholders, or uncertain `<` / `>` balance are preserved unchanged.

## Experimental external link formatting

External link formatting is experimental and disabled by default:

```sh
wikitext-fmt page.wiki --level experimental --format-external-links
```

The rule is parser-assisted and handles only standalone whole-line labelled external links. It normalizes only extra horizontal whitespace between the URL and label:

```wikitext
[https://example.com  Label]
```

becomes:

```wikitext
[https://example.com Label]
```

Bare external links, inline links, malformed links, links with templates, nested wikilinks, HTML, table/list/ref contexts, multiple links on one line, and protected placeholders are preserved unchanged. URLs and labels are not otherwise rewritten.

## Page footer and behavior switches

The normal-level behavior-switch rule recognizes standalone aliases for the supported MediaWiki behavior-switch IDs. Its default `behaviorSwitchPlacement: "preserve"` only removes trailing horizontal whitespace and leaves each switch in place. Embedded switches and switches inside templates, tables, refs, comments, or protected blocks are not changed.

Set `behaviorSwitchPlacement: "footer"` or use `--behavior-switch-placement footer` to move recognized standalone switches to the footer while preserving their order. Exact duplicate switch lines are removed in footer mode. Explicit footer mode produces these groups with one blank line between them:

```wikitext
Body content

__NOTOC__
__NOEDITSECTION__

{{DEFAULTSORT:Example}}
[[Category:A]]
[[Category:B]]
```

Standalone aliases for the MediaWiki `defaultsort` magic-word ID move before recognized namespace-ID-14 category links. Footer metadata detection is parser-assisted: the formatter uses `wikiparser-node` category nodes when available and parser ranges to avoid moving categories, defaultsorts, behavior switches, or interlanguage links that are inside templates. Line-level matching remains for custom/site category aliases, localized syntax, and other whole-line metadata checks. Categories retain titles, sort keys, and relative order; category-talk namespaces and unknown category-like links remain in place. Disable switch handling with `--no-format-behavior-switches` or `formatBehaviorSwitches: false`.

## Experimental interlanguage footer formatting

Interlanguage link movement is experimental and disabled by default because many modern Wikimedia sites rely on Wikidata rather than page-local language links.

Enable it explicitly:

```sh
wikitext-fmt page.wiki --level experimental --format-interlanguage-links --interlanguage-placement footer
```

The rule recognizes only standalone whole-line links with configured prefixes, such as `[[en:Foo]]`, `[[ja:Foo]]`, or `[[zh:Foo]]`. It does not handle `[[:en:Foo]]`, labelled links, embedded links, category links, file links, template arguments, table lines, multiple links on one line, or unknown prefixes. Targets and prefix spelling are preserved exactly and links are never sorted.

When `interlanguagePlacement` is `footer`, recognized links move to the very end of the page, after categories, preserving their relative order. `interlanguagePrefixes` defaults to a small documented set of common language codes and can be replaced with a comma-separated CLI value or config array.

## Experimental section spacing

Section spacing is experimental and disabled by default. Enable it with:

```sh
wikitext-fmt page.wiki --level experimental --format-section-spacing
```

The rule is parser-assisted for heading detection, then only inserts a single blank line before or after headings when the adjacent line is ordinary paragraph text. It avoids headings at the start of the file and does not alter spacing next to templates, tables, lists, comments, behavior switches, categories, redirects, file links, HTML or extension tags, or protected blocks. It does not change heading marker spacing; that remains the heading rule's job.

## Structural template formatting

Template formatting is a normal-level default. The unified parser-assisted
engine handles both compact and existing multiline templates:

```wikitext
{{Template
| a=b
| c = d
}}
```

becomes:

```wikitext
{{Template
| a = b
| c = d
}}
```

The engine uses parser argument nodes for order, named/anonymous state, keys,
values, and source ranges. It formats nested templates deepest-first and supports
numeric, anonymous, empty, and Unicode parameters; parser functions; multiline
values; comments; links; refs; HTML; multiple templates; and templates inside
table cells. Multiple named parameters, existing multiline layout, long
templates, and structured values select multiline layout. Anonymous argument
values—including leading/trailing spaces, tabs, newlines, empty values, and
parser-function arguments—are preserved byte-for-byte. The engine tries a full
multiline candidate, then progressively less aggressive boundary-safe layouts,
and accepts only a parseable, idempotent candidate with the exact same
structural fingerprint. It can therefore expand the template shell before the
first positional delimiter and after named values without inserting or
removing whitespace in an anonymous value. Nested supported structures still
format deepest-first. Parser-confirmed tables inside template arguments are
treated as opaque argument content after table formatting, so surrounding
named parameters and the outer template layout can still be normalized. A
single short parameter may remain compact. Parameters and values are never
reordered, renamed, renumbered, or semantically rewritten.

`formatTemplateParameters` and `--format-template-parameters` remain as pre-1.0
compatibility aliases and route to this same engine; there is no second scanner.
Disable template formatting with `--no-format-templates`.

Parser functions use an explicit function-specific policy. Production currently
classifies whitespace-sensitive core functions such as `#if`, `#ifeq`,
`#switch`, `#expr`, `#tag`, and `#invoke` as `opaque-preserve`; an unknown
`#` function is `unsupported-ambiguous`. The other policy classes,
`safe-named-argument-normalization` and `safe-layout-formatting`, remain
available only for functions whose MediaWiki whitespace behavior is established
by dedicated semantics tests. No generic magic-word whitespace rule is applied.

### Localization data

Localized syntax aliases are data-driven; the formatter does not infer them from translated words.

- `localizationSource: "builtin"` (default) uses the generated MediaWiki core alias table. The initial table is extracted by `scripts/update-mediawiki-aliases.ts` from MediaWiki core message files for `ar`, `de`, `es`, `fr`, `it`, `ja`, `ko`, `pl`, `pt`, `ru`, `uk`, `zh-hans`, and `zh-hant`.
- `localizationSource: "siteinfo"` requires `--site-api <url>`. The CLI requests namespace IDs 6 and 14, namespace aliases, magic words including `defaultsort`, `redirect`, and image options, and double-underscore behavior switches from the site's `action=query&meta=siteinfo` API. Fetch or validation failure stops the CLI; it never silently falls back to built-in data.
- `localizationSource: "custom"` uses canonical English syntax plus `localizationAliases`. Custom aliases also override conflicting built-in or siteinfo behavior-switch aliases.

`localizedSyntaxStyle: "preserve"` (default) recognizes aliases but retains their exact spelling. `"canonical-english"` rewrites only a certainly matched namespace, magic-word keyword, or file option keyword: category namespaces become `Category`, file namespaces become `File`, `defaultsort` becomes `DEFAULTSORT`, redirects become `#REDIRECT`, recognized image options become canonical English option names, and behavior switches use their canonical English ID. Page titles, redirect targets, file names, captions, category names, sort keys, arguments, and normal text are never translated.

In canonical English mode, duplicate behavior switches are de-duplicated by emitted canonical value. For example, localized `notoc` plus `__NOTOC__` at the footer produce one `__NOTOC__`.

Canonicalization diagnostics count keyword rewrites only. Moving `[[Category:A]]` to the footer does not increment `localizedCategoryAliasesCanonicalized`; changing `[[分類:A]]` to `[[Category:A]]` does.

Generated `defaultsort` aliases that do not include a trailing colon are recognized only when the wikitext supplies an explicit `:` separator, such as `{{SORTUJ:Key}}`. This avoids treating unrelated templates like `{{SORTUJKey}}` as magic words.

Site-specific namespace and magic-word aliases require siteinfo or explicit custom aliases. Core API consumers selecting `siteinfo` must preload and pass `localizationAliases`; network access exists only in the CLI loader.

Inspect aliases before formatting with:

```sh
wikitext-fmt --print-localization-aliases
wikitext-fmt --print-localization-aliases --localization-source siteinfo --site-api https://wiki.example/w/api.php
```

## Structural table formatting

Tables are a normal-level rule enabled by default:

```sh
wikitext-fmt page.wiki --safe
```

Parser table and cell syntax nodes are the first authority. A narrow balanced
separator fallback is used only when the upstream parser is known to tokenize
`||` inside a link label as a cell. Another parser-confirmed reparse at an exact
`{|` opener handles tables hidden by the parser's template-stage order. Both
fallbacks are reported precisely.

`tableCellSeparatorStyle` controls safe inline cell separators per table:

- `auto` (default) splits every parser-confirmed multi-cell row.
- `split` explicitly requests the same strongest structural layout.
- `preserve` leaves inline `!!` and `||` layout unchanged.

Nested tables run deepest-first. Tables inside template text, attributes,
captions, header/data cells, empty cells, continuation lines, comments,
rowspan/colspan, templates, parser functions, links, HTML, extension tags, refs,
and localized contents are supported as opaque parser-confirmed cell content.
Rows, cells, attributes, and contents are never reordered or visually padded.
Cell content whitespace is preserved exactly when inline separators are split.
Use `--debug` for per-table boundary and fallback diagnostics:

```sh
wikitext-fmt page.wiki --safe --debug
```

## Current limitations

The formatter intentionally does not provide site-specific template layouts,
sort categories, reorder template parameters, rewrite arbitrary prose, or
align table columns with padding. These are product boundaries.

- Template parameters are not reordered.
- Template names, parameter names, anonymous/named state, and values are not rewritten.
- Only standalone category namespace aliases backed by the selected localization data are moved; categories are never sorted.
- List formatting is limited to safe spacing and trailing-whitespace cleanup on ordinary single-line items.
- File/image link formatting is limited to one safe standalone file link per line; captions and values are preserved.
- External link formatting is experimental, disabled by default, and limited to parser-confirmed standalone labelled links.
- Reference formatting is experimental, disabled by default, and limited to standalone self-closing `<ref ... />` and `<references ... />` lines.
- Interlanguage link movement is experimental, disabled by default, and limited to standalone unlabelled links with configured prefixes.
- Section spacing is experimental, disabled by default, and only applies around headings adjacent to ordinary paragraph text.
- Only aliases backed by built-in MediaWiki data, siteinfo, or explicit custom configuration participate in footer formatting.
- Unclosed tables and genuinely unbalanced parser boundaries are preserved with precise diagnostics.
- Table columns are not aligned or padded, and rows, cells, and attributes are never reordered.
- Single-block ignore handling is deliberately line/paragraph oriented. Range ignores are preferred for complex content.
- Site-specific parser grammar still requires an appropriate parser configuration in addition to localization aliases.

Ignore a range with:

```wikitext
<!-- wikitext-fmt-ignore-start -->
content left unchanged
<!-- wikitext-fmt-ignore-end -->
```

`<!-- wikitext-fmt-ignore -->` conservatively skips the next heading, category line, or paragraph-like block.

## Development

```sh
pnpm test
pnpm test:run
pnpm build
pnpm check
pnpm corpus
pnpm benchmark
pnpm benchmark:release
pnpm smoke
pnpm localization:update /path/to/mediawiki/languages/messages
```

The structural benchmark covers 10 KB, 100 KB, and 1 MB pages; 10, 100, and
500-template/table matrices; deep nesting; tables inside templates; and false
table openers in protected content. It records parser contexts and source bytes
parsed, formatting passes, total and equivalence time, fallback candidate work,
and process memory. CI uses deterministic complexity assertions for fallback
parse counts and bounded source ranges instead of machine-sensitive wall-clock
ceilings.

`pnpm benchmark:release` records a fresh timing/RSS report and compares it with
the versioned reference in `benchmarks/structural-baseline.json`. The comparison
is a release-review artifact; optional ratio thresholds can be supplied to the
comparison script, while ordinary CI remains deterministic and
machine-independent.

`pnpm smoke` expects `pnpm build` to have run. It imports `dist/index.js`, runs `dist/cli.js --help`, checks that `loadSiteInfoAliases` is exported, verifies generated MediaWiki alias data is available from `dist`, and exercises `--print-localization-aliases --localization-source builtin` without network access.

GitHub Actions runs frozen installs, `pnpm check`, and both production corpus profiles on Node.js 22 and 24. A separate Node.js 24 release job runs extension-host, VSIX, and complete VS Code release checks.

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before publishing the npm
package or VS Code extension.

The repository is a pnpm workspace. The root package contains the formatter core and CLI; `packages/vscode` is a thin VS Code wrapper that depends on the root package and does not duplicate formatter rules. Core modules do not import the CLI or the editor wrapper.

Parser-assisted rules share an internal parser context for a single source snapshot where practical. That context is deliberately not part of the public API: once any rule changes text, later parser-assisted rules must parse the new source snapshot instead of reusing stale node ranges.

Regression fixtures use this layout:

```text
tests/fixtures/<case>/input.wiki
tests/fixtures/<case>/expected.wiki
tests/fixtures/<case>/options.json # optional
tests/table-samples/<case>/input.wiki
tests/table-samples/<case>/expected.wiki
tests/real-pages/*.wiki
```

Structural testing is intentionally layered:

- `tests/tables.test.ts` uses table-driven cases for parser boundaries, diagnostics, and structural safety.
- `tests/structural-matrix.test.ts` generates template/table combinations and requires parsing, a real change, equivalence, and idempotency for every case.
- Six compact fixtures cover exact user-visible formatter output without duplicating every internal decision reason.
- `tests/table-samples` contains realistic expected-diff calibrations for compact, sortable, mixed-style, template-containing, commented, and multiline-cell tables.
- Files under `real-pages` cover article, template-heavy, table-heavy,
  reference-heavy, file/image-heavy, external-link-heavy, footer-heavy,
  localized, redirect, protected/ignored, and list/heading page shapes. Every
  page runs through default, canonical-localization, individual experimental,
  combined experimental, and canonical footer option matrices with safe parse,
  diagnostics-consistency, and idempotency assertions.

Table samples verify exact calibrated output. The corpus runner aggregates rule
coverage and exact skip frequencies across committed or external page sets.

Planned work includes a Prettier plugin and improved site-specific parser
configuration.

## License

The project is released under the [GPL v3 License](LICENSE).

```text
    wikitext-fmt
    Copyright (C) 2026 SkyEye_FAST

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

## Feedback

Please feel free to raise issues for any problems encountered or feature suggestions.

Pull requests are welcome.

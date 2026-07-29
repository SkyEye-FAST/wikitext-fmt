# CLI reference

The executable is `wikitext-fmt`.

```text
Usage: wikitext-fmt [options] <file-or-glob...>
       wikitext-fmt --stdin [options]
```

`wikitext-fmt --help` prints a structured option reference generated partly
from formatter option metadata. This document defines the full command
contract.

## Command modes

| Mode | Output | Files changed | Exit behavior |
| --- | --- | --- | --- |
| no mode flag | Formatted text on stdout | No | 0 unless argument/config/path/report processing fails |
| `--write` | No formatted text | Yes | 0 unless processing fails; warnings fail only with `--fail-on-warning` |
| `--check` | No formatted text | No | 1 if any accepted output differs |
| `--diff` | Unified diff on stdout | No | 1 if any accepted output differs |
| `--stdin` | Uses stdin instead of paths | Never | Follows normal, check, or diff behavior |
| `--print-localization-aliases` | Resolved alias JSON on stdout | No | Returns without formatting input |

With multiple file inputs and no write/check/diff mode, formatted documents are
concatenated on stdout in stable path order.

## General and CLI-only options

| Option | Behavior |
| --- | --- |
| `--help` | Print structured help to stdout and exit 0 |
| `--version`, `-v` | Print only the core package version plus a newline and exit 0 |
| `--write` | Replace each input file with accepted output |
| `--check` | Suppress formatted output and report needed changes through exit 1 |
| `--diff` | Emit unified diffs without modifying files |
| `--stdin` | Read one UTF-8 input from stdin |
| `--safe` | Add the second formatting pass that verifies idempotency |
| `--unsafe` | Select the base formatter pipeline without that additional pass |
| `--debug` | Emit human-readable mode, level, result, and table details to stderr |
| `--diagnostics-json` | Emit one JSON diagnostic record per input to stderr |
| `--fail-on-warning` | Exit 1 if any formatter result contains a structured failure |
| `--report <path>` | Write an aggregate JSON batch report after processing |
| `--config <path>` | Load one explicit validated JSON config |
| `--no-config` | Disable config discovery and loading |
| `--site-api <url>` | Fetch aliases when the resolved localization source is `siteinfo` |
| `--print-localization-aliases` | Print the final alias set without formatting input |

`--version` and `-v` are intentionally recognized before normal argument
parsing. They do not validate other arguments, load config, fetch siteinfo,
expand paths, or read files/stdin. Tests cover both aliases with otherwise
invalid and irrelevant arguments.

Without an explicit safety flag, the `production` and `aggressive` profiles
select the additional idempotency pass automatically. The `default` profile
uses the base pipeline. `--safe` or `--unsafe` explicitly overrides that
profile-based choice.

## Formatter value options

| Option | Values | Corresponding config key |
| --- | --- | --- |
| `--profile <value>` | `default`, `production`, `aggressive` | `profile` |
| `--level <value>` | `safe`, `normal`, `experimental` | `level` |
| `--parser-config <value>` | Bundled parser name or JSON path | `parserConfig` |
| `--html-void-tag-style <value>` | `html5`, `xhtml`, `preserve` | `htmlVoidTagStyle` |
| `--table-cell-separator-style <value>` | `auto`, `split`, `preserve` | `tableCellSeparatorStyle` |
| `--interlanguage-placement <value>` | `preserve`, `footer` | `interlanguagePlacement` |
| `--interlanguage-prefixes <a,b,...>` | Non-empty comma-separated list | `interlanguagePrefixes` |
| `--behavior-switch-placement <value>` | `preserve`, `footer` | `behaviorSwitchPlacement` |
| `--localization-source <value>` | `builtin`, `siteinfo`, `custom` | `localizationSource` |
| `--localized-syntax-style <value>` | `preserve`, `canonical-english` | `localizedSyntaxStyle` |

`lineWidth`, `templateParameterLayout`, and `localizationAliases` are
config/API-only; the CLI has no direct flag for these keys.

## Rule switches

These boolean switches come from the same option schema used by config
validation:

| Option | Config key |
| --- | --- |
| `--no-format-headings` | `formatHeadings: false` |
| `--no-format-templates` | `formatTemplates: false` |
| `--format-template-parameters`, `--no-format-template-parameters` | `formatTemplateParameters` |
| `--no-format-categories` | `formatCategories: false` |
| `--no-format-lists` | `formatLists: false` |
| `--no-format-file-links` | `formatFileLinks: false` |
| `--format-external-links`, `--no-format-external-links` | `formatExternalLinks` |
| `--format-references`, `--no-format-references` | `formatReferences` |
| `--format-interlanguage-links`, `--no-format-interlanguage-links` | `formatInterlanguageLinks` |
| `--format-section-spacing`, `--no-format-section-spacing` | `formatSectionSpacing` |
| `--no-format-behavior-switches` | `formatBehaviorSwitches: false` |
| `--no-format-redirects` | `formatRedirects: false` |
| `--format-tables`, `--no-format-tables` | `formatTables` |
| `--no-normalize-blank-lines` | `normalizeBlankLines: false` |

The reliability level must also admit a rule. For example,
`--format-references` does not run at `--level normal`.

## Files and globs

Paths and dynamic glob patterns may be mixed. Globs use `fast-glob` with
dotfiles and symbolic-link following enabled and return files only. All
resolved paths are deduplicated and sorted by their working-directory-relative
spelling before processing.

An unmatched glob, missing explicit path, or non-file path is an error with
exit 2. Directories are not formatted.

## Stdin restrictions

`--stdin` cannot be combined with file paths or `--write`. It may be combined
with normal output, `--check`, `--diff`, diagnostics, reports, and formatter
options. Diffs label the input `stdin`.

## Config and siteinfo

Without `--config` or `--no-config`, the CLI discovers config upward from the
current working directory. CLI values override the same keys from the selected
config. See [Configuration](configuration.md).

If the resolved `localizationSource` is `siteinfo`, `--site-api` is required.
The CLI performs one read-only MediaWiki siteinfo request, converts the result
to custom aliases, and passes those aliases to the core. Fetch or validation
errors exit 2; there is no silent built-in fallback.

## Streams

- Formatted text, unified diffs, version output, help, and resolved alias JSON
  use stdout.
- Warnings, debug output, JSON diagnostic records, and argument/config/path
  errors use stderr.
- `--report` writes JSON only to its requested file.
- `--check` emits no formatted text.

Diagnostics never intentionally share stdout with formatted text or diffs.

## Exit statuses

| Status | Meaning |
| --- | --- |
| 0 | Operation completed and no selected failure condition occurred |
| 1 | `--check`/`--diff` found changes, or `--fail-on-warning` saw a structured fallback |
| 2 | Invalid/incompatible arguments, config/localization failure, input path/glob failure, or report-write failure |

Formatter warnings do not fail by default.

## Incompatible options

The parser rejects:

- `--write` with `--check` or `--diff`;
- `--debug` with `--diagnostics-json`;
- `--config` with `--no-config`;
- `--safe` with `--unsafe`;
- `--stdin` with paths or `--write`;
- `--print-localization-aliases` with `--write`, `--check`, `--diff`, or
  `--stdin`;
- an invocation with no path unless `--stdin` or
  `--print-localization-aliases` is present.

`--diff` and `--check` may be combined; both suppress formatted text and use
the same change exit status, while diff output still goes to stdout.

## Diagnostics and reports

`--debug` is for people. `--diagnostics-json` emits one compact JSON record per
input. `--report` writes one aggregate document containing file records and
summed counters. The fields and pre-1.0 compatibility status are documented in
[Safety and diagnostics](safety-and-diagnostics.md).

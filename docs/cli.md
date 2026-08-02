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
| `--print-site-configuration` | Sanitized resolved project/site JSON on stdout | No | Returns without formatting input |
| `--validate-site-configuration` | Sanitized resolved project/site JSON | No | 0 when valid; 2 on failure |
| standalone `--refresh-site-configuration` | Sanitized resolved project/site JSON after atomic update | No | May also precede normal formatting |

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
| `--site-api <url>` | Override the project MediaWiki API URL |
| `--site-snapshot <path>` | Override the project snapshot path |
| `--refresh-site-configuration` | Bypass snapshot/cache, fetch once, and atomically update configured cache/snapshot paths |
| `--print-site-configuration` | Print sanitized source, paths, freshness, parser, overrides, data, and final options |
| `--validate-site-configuration` | Resolve site and parser configuration without formatter input |
| `--print-localization-aliases` | Print the final alias set without formatting input |

`--version` and `-v` are intentionally recognized before normal argument
parsing. They do not validate other arguments, load config, fetch siteinfo,
expand paths, or read files/stdin. Tests cover both aliases with otherwise
invalid and irrelevant arguments.

Without an explicit safety flag, the `production` profile selects the additional
idempotency pass automatically. The `default` profile uses the base pipeline.
`--safe` or `--unsafe` explicitly overrides that profile-based choice.

`default` provides the standard interactive options. `production` enables all
mature normal rules, including parser-confirmed interlanguage footer placement,
and is suitable for routine automation. Both profiles retain the base parse,
round-trip, structural-equivalence, convergence, and fail-closed checks. The
pre-1.0 `aggressive` profile has been removed and is rejected explicitly.

Pure LF and pure CRLF files retain their line-ending style in normal output,
`--check`, `--diff`, and `--write`; formatter-created line breaks use the same
style. Mixed LF/CRLF and bare CR produce an `unsupported-line-endings` warning
and remain byte-for-byte unchanged. Warnings keep the normal exit status unless
`--fail-on-warning` is selected, and `--write` never rewrites a rejected file.

## Formatter value options

| Option | Values | Corresponding config key |
| --- | --- | --- |
| `--profile <value>` | `default`, `production` | `profile` |
| `--level <value>` | `safe`, `normal`, `experimental` | `level` |
| `--parser-config <value>` | Bundled parser name or JSON path | `parserConfig` |
| `--html-void-tag-style <value>` | `html5`, `xhtml`, `preserve` | `htmlVoidTagStyle` |
| `--table-cell-separator-style <value>` | `auto`, `split`, `preserve` | `tableCellSeparatorStyle` |
| `--inline-template-spacing <value>` | `auto`, `compact`, `spaced` | `inlineTemplateSpacing` |
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
| `--no-format-categories` | `formatCategories: false` |
| `--no-format-lists` | `formatLists: false` |
| `--no-format-file-links` | `formatFileLinks: false` |
| `--no-format-wikilinks` | `formatWikilinks: false` |
| `--format-external-links`, `--no-format-external-links` | `formatExternalLinks` |
| `--format-references`, `--no-format-references` | `formatReferences` |
| `--format-interlanguage-links`, `--no-format-interlanguage-links` | `formatInterlanguageLinks` |
| `--format-section-spacing`, `--no-format-section-spacing` | `formatSectionSpacing` |
| `--no-format-behavior-switches` | `formatBehaviorSwitches: false` |
| `--no-format-redirects` | `formatRedirects: false` |
| `--format-tables`, `--no-format-tables` | `formatTables` |
| `--no-normalize-blank-lines` | `normalizeBlankLines: false` |

The reliability level must also admit a rule. Interlanguage links are a normal
rule, so `--level safe` disables them; movement additionally requires
`--interlanguage-placement footer`.

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

## Config and site configuration

Without `--config` or `--no-config`, the CLI discovers config upward from the
current working directory. CLI values override the same keys from the selected
config. See [Configuration](configuration.md).

The project config may contain a strict `site` object with `apiUrl`,
`parserConfig`, `snapshotPath`, `cachePath`, `cacheMaxAgeSeconds`, and
`allowStaleCache`. Relative project paths resolve from the config directory;
relative `--site-snapshot` paths resolve from the CLI working directory.

The CLI resolves explicit snapshot, fresh cache, network, then an explicitly
allowed valid stale cache after network failure. Without `cachePath`, caching is
in memory only. Corrupt, version-mismatched, or API-mismatched cache data is
reported and never used. Network or validation failure exits 2; there is no
silent built-in fallback. Same-API concurrent work shares one request, and
`cacheMaxAgeSeconds: 0` revalidates once in each process or explicit refresh.

MediaWiki siteinfo is converted to custom aliases plus authoritative language
prefixes from `interwikimap` entries marked `language` or `extralanglink`.
Generic interwiki entries are excluded unless explicitly configured. Explicit
formatter aliases/prefixes win. When a site source is configured and
`localizationSource` is omitted, site aliases apply automatically. An explicit
`builtin` retains built-in aliases, although site prefixes can still apply.

`--refresh-site-configuration` bypasses snapshot/cache and requires an API. It
writes deterministic schema-version-1 JSON through temporary-file-plus-rename.
`--print-site-configuration` never prints credentials or API query/fragment
data. `--validate-site-configuration` exercises the same resolver and parser
config validation without formatting input.

## Streams

- Formatted text, unified diffs, version output, help, resolved alias JSON, and
  resolved site configuration JSON use stdout.
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
- configuration inspection (`--print-localization-aliases`,
  `--print-site-configuration`, `--validate-site-configuration`, or a standalone
  refresh) with `--write`, `--check`, `--diff`, or `--stdin`;
- an invocation with no path unless `--stdin`, an inspection mode, or standalone
  `--refresh-site-configuration` is present.

`--diff` and `--check` may be combined; both suppress formatted text and use
the same change exit status, while diff output still goes to stdout.

## Diagnostics and reports

`--debug` is for people. `--diagnostics-json` emits one compact JSON record per
input. `--report` writes one aggregate document containing file records and
summed counters. Each record includes resolved site source, API/parser sources,
paths, fetched timestamp, stale state, applied data, namespace conflicts, and
resolver diagnostics. The fields are documented in
[Safety and diagnostics](safety-and-diagnostics.md).

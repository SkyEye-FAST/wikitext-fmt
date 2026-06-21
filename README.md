# wikitext-fmt

`wikitext-fmt` is a conservative, standalone formatter for MediaWiki wikitext. It uses [`wikiparser-node`](https://github.com/bhsd-harry/wikiparser-node) to parse and validate input, but it is not a MediaWiki extension and does not require a running MediaWiki installation.

The formatter intentionally handles only structures that can be changed with a small, predictable transformation. It does **not** guarantee that every wikitext construct will be formatted. Risky templates, tables, protected extension tags, and ignored regions are preserved rather than aggressively rewritten.

It is not a full replacement for Pywikibot's `cosmetic_changes.py`. Its scope and defaults are deliberately narrower, including HTML5-style `<br>` output rather than XHTML-style `<br />` output.

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
wikitext-fmt page.wiki --level experimental --format-tables
wikitext-fmt page.wiki --diff
wikitext-fmt page.wiki --diagnostics-json --check
wikitext-fmt page.wiki --safe --check --fail-on-warning
wikitext-fmt "pages/**/*.wiki" --check --report report.json
wikitext-fmt page.wiki --localization-source siteinfo --site-api https://wiki.example/w/api.php
wikitext-fmt --print-localization-aliases --localization-source builtin
```

Without `--write`, formatted wikitext is written to stdout. `--check` writes nothing and exits with status 1 when a file would change. Available switches are:

```text
--write
--check
--stdin
--safe
--debug
--diff
--diagnostics-json
--fail-on-warning
--report <path>
--config <path>
--no-config
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

`--diagnostics-json` writes one JSON object per input to stderr. Each object includes `file`, `changed`, `warning`, table counters, footer counters (`behaviorSwitchesMoved`, `behaviorSwitchesFormatted`, `defaultsortMoved`, `categoriesMoved`, `interlanguageLinksMoved`, and `interlanguageLinksFormatted`), redirect counters (`redirectsFormatted`), file-link counters (`fileLinksFormatted`), section-spacing counters, template-parameter counters, canonicalization counters (`localizedCategoryAliasesCanonicalized`, `localizedDefaultsortAliasesCanonicalized`, `localizedBehaviorSwitchesCanonicalized`, `localizedRedirectAliasesCanonicalized`, `localizedFileNamespaceAliasesCanonicalized`, and `localizedImageOptionsCanonicalized`), and complete table diagnostics. Formatted text or diffs remain on stdout. JSON diagnostics cannot be combined with the text-oriented `--debug` mode.

`--safe` enables parse-before, parse-after, and idempotency verification. If verification fails, the original input is returned and a warning is written to stderr. `--debug` writes the selected mode, rule level, and result status to stderr without contaminating formatted stdout.

`--fail-on-warning` changes warning handling only: if any input falls back with a formatter warning, the CLI exits non-zero. This is useful with `--safe --check`; warnings do not affect the exit code by default.

`--report <path>` writes one JSON batch report after all inputs are processed. It contains each file's `changed`, `warning`, summary, and table diagnostics plus aggregate file, table, footer, redirect, and canonicalization counts. Reports never share stdout with formatted text or diffs and are compatible with normal output, `--check`, `--diff`, `--write`, and `--stdin`. The report schema is experimental before 1.0; changes should be additive where practical, but consumers should not treat it as stable yet.

`--print-localization-aliases` resolves the configured alias source and prints the final alias JSON to stdout without formatting input files. With `--localization-source siteinfo`, it requires `--site-api`.

Formatting levels are cumulative:

| Level          | Enabled rules                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `safe`         | Heading spacing, blank-line normalization, and ordinary HTML void-tag normalization                                         |
| `normal`       | Safe rules, simple templates, redirects, file links, page-footer metadata, behavior switches, and conservative list spacing |
| `experimental` | Safe and normal rules plus explicitly enabled experimental rules                                                            |

The default is `normal`. Table formatting is experimental and disabled by default; it runs only when both `--level experimental` and `--format-tables` are provided.

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
  "formatTables": false,
  "tableCellSeparatorStyle": "auto",
  "normalizeBlankLines": true
}
```

Unknown keys and invalid option values are rejected instead of being silently ignored. Configuration discovery and loading are CLI concerns; the formatter core does not read files or inspect the working directory.

## API

```ts
import {
  formatWikitext,
  formatWikitextSafe,
  loadSiteInfoAliases,
} from "wikitext-fmt";

const output = formatWikitext(source, {
  parserConfig: "mediawiki",
  lineWidth: 120,
  formatHeadings: true,
  formatTemplates: true,
  formatTemplateParameters: false,
  formatCategories: true,
  formatLists: true,
  formatFileLinks: true,
  formatInterlanguageLinks: false,
  interlanguagePlacement: "preserve",
  interlanguagePrefixes: ["en", "ja", "zh"],
  formatSectionSpacing: false,
  formatRedirects: true,
  formatBehaviorSwitches: true,
  behaviorSwitchPlacement: "preserve",
  localizationSource: "builtin",
  localizedSyntaxStyle: "preserve",
  formatTables: false,
  tableCellSeparatorStyle: "auto",
  normalizeBlankLines: true,
  level: "normal",
  htmlVoidTagStyle: "html5",
});

const result = formatWikitextSafe(source);
if (result.warning) {
  console.warn(result.warning);
}
console.log(result.formatted);

const siteAliases = await loadSiteInfoAliases("https://wiki.example/w/api.php");
const siteOutput = formatWikitext(source, {
  localizationSource: "siteinfo",
  localizationAliases: siteAliases,
});
```

For API use, `localizationSource: "siteinfo"` means “use aliases that were loaded from siteinfo.” The formatter core does not fetch network data; call `loadSiteInfoAliases()` first and pass the result as `localizationAliases`. If `siteinfo` is selected without aliases, formatting fails closed with a warning. The CLI performs this loading when `--localization-source siteinfo --site-api <url>` is used.

`formatWikitext()` remains the compact string-returning API. `formatWikitextResult()` exposes warnings without running the additional idempotency pass.

## Rule reliability

Every current rule has an exported reliability level in `ruleLevels`:

- `headings`: `safe`
- `blankLines`: `safe`
- `templates`: `normal`
- `templateParameters`: `experimental`
- `categories`: `normal`
- `lists`: `normal`
- `fileLinks`: `normal`
- `interlanguageLinks`: `experimental`
- `sectionSpacing`: `experimental`
- `redirects`: `normal`
- `behaviorSwitches`: `normal`
- `htmlVoidTags`: `safe`
- `tables`: `experimental`

`htmlVoidTagStyle` controls only simple, attribute-free `br`, `hr`, and `wbr` tags. Its default, `html5`, changes `<br />` to `<br>`. Use `xhtml` for `<br />` output or `preserve` to leave existing syntax unchanged. MediaWiki extension tags such as `<ref />` and `<references />` are never handled by this rule.

The levels describe formatter confidence, not a proof of semantic equivalence for arbitrary site-specific wikitext. Use an appropriate parser configuration and `formatWikitextSafe()` for automation over unfamiliar pages.

## List formatting

The normal-level list rule handles ordinary single-line items beginning with combinations of `*`, `#`, `:`, and `;`. It adds one missing space after the marker sequence and removes trailing horizontal whitespace. Existing spacing, blank lines, nesting markers, and definition-list structure remain intact.

List lines containing templates, table syntax, wikilinks, HTML, or extension tags are preserved unchanged. Protected blocks such as `nowiki`, `pre`, and `syntaxhighlight` are never inspected by this rule. Disable it with `--no-format-lists` or `formatLists: false`.

## Redirect formatting

The normal-level redirect rule handles only a redirect on the first non-empty page line. It recognizes the selected localization data's `redirect` magic-word aliases and normalizes spacing from `#REDIRECT[[Target]]` to `#REDIRECT [[Target]]`.

With `localizedSyntaxStyle: "preserve"`, the original alias spelling is kept, such as `#転送 [[Target]]`. With `"canonical-english"`, recognized localized aliases are emitted as `#REDIRECT [[Target]]`, and `localizedRedirectAliasesCanonicalized` is incremented when the keyword changes.

The rule is intentionally narrow. It skips redirect-like lines that are not first non-empty content, have unbalanced links, include templates in the target, contain multiple links, have trailing text or comments, or include HTML on the same line. Disable it with `--no-format-redirects` or `formatRedirects: false`.

## File and image link formatting

The normal-level file-link rule handles only one simple file/image link occupying a whole line, such as:

```wikitext
[[File:Example.png|thumb|right|300px|alt=Example]]
```

It recognizes File namespace aliases and image option aliases from the selected localization data. File namespace matching normalizes underscores to spaces and compares aliases case-insensitively, while preserving the original namespace spelling in `localizedSyntaxStyle: "preserve"` mode. Preserve mode keeps option spelling and only trims trailing horizontal whitespace when the line is otherwise safe.

In `"canonical-english"` mode, the rule rewrites only certainly matched syntax keywords: localized File namespace aliases become `File`, and recognized image options such as localized `thumb`, `right`, `left`, or `center` become their canonical English option names. File names, captions, alt text values, link targets, page numbers, class/lang values, widths such as `300px`, and normal text are not translated or reordered.

The rule skips lines with multiple wikilinks, nested links, templates, parser-function-like syntax, HTML or extension tags, multiline links, gallery contents, and table lines. Disable it with `--no-format-file-links` or `formatFileLinks: false`.

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

Standalone aliases for the MediaWiki `defaultsort` magic-word ID move before recognized namespace-ID-14 category links. Categories retain titles, sort keys, and relative order; category-talk namespaces and unknown category-like links remain in place. Disable switch handling with `--no-format-behavior-switches` or `formatBehaviorSwitches: false`.

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

The rule only inserts a single blank line before or after headings when the adjacent line is ordinary paragraph text. It avoids headings at the start of the file and does not alter spacing next to templates, tables, lists, comments, behavior switches, categories, redirects, file links, HTML or extension tags, or protected blocks. It does not change heading marker spacing; that remains the heading rule's job.

## Experimental multiline template parameter formatting

Template parameter formatting is experimental and disabled by default:

```sh
wikitext-fmt page.wiki --level experimental --format-template-parameters
```

It only handles templates that are already multiline and structurally simple:

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

The rule does not split single-line templates, join multiline templates, reorder parameters, rename parameters, remove blank parameters, or change the template name. When this experimental rule is enabled, the normal simple one-line template splitter is skipped so `{{Template|a=b}}` remains single-line.

Only simple named parameter lines are normalized. Parameter names may contain Unicode letters/numbers plus spaces, underscores, and hyphens; empty names and numeric-only positional names are skipped. Indentation before `|` is preserved, empty values are preserved, and trailing horizontal whitespace on safe template structural lines is removed.

The current multiline-value policy is conservative but not whole-block fatal: continuation lines are preserved unchanged, and later safe parameter lines in the same simple template may still be formatted. Lines with comments, unnamed or numeric positional parameters, multiline values, nested templates, parser functions, tables, lists, HTML or extension tags, or unsafe piped wikilinks are preserved. Blocks containing nested templates are skipped entirely.

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

## Experimental table formatting

Enable the table pass explicitly:

```sh
wikitext-fmt page.wiki --safe --level experimental --format-tables
```

It currently trims trailing whitespace on recognized structural lines and handles only safely recognized same-line `!!` and `||` cells. Simple wikilinks, piped wikilinks, external links, and straightforward cell/header attributes are supported. Dedicated fixtures cover supported tables, partial row formatting, separator styles, and preserved unsafe cases.

`tableCellSeparatorStyle` controls safe inline cell separators per table:

- `auto` (default) preserves simple compact inline tables. It chooses split lines for cell attributes, four or more columns, safe inline lines exceeding `lineWidth`, already split or mixed layouts, skipped unsafe rows, and tables with 12 or more recognized cell lines.
- `split` always splits safely recognized `!!` and `||` separators onto separate structural lines.
- `preserve` keeps safe inline separators and only performs conservative trailing-whitespace and structural cleanup.

Auto detection is table-local rather than file-wide. Unsafe rows make auto prefer split style for the remaining safe rows, but those unsafe rows are still preserved unchanged. Explicit `split` and `preserve` settings override every auto heuristic.

Debug diagnostics include both the selected style and reason, for example `formatted using split style: many columns`. These diagnostics are only written when `--debug` is enabled.

Within a structurally safe table, safe rows may be formatted while cell lines containing templates, HTML or extension tags, unsafe separators, or unbalanced brackets/quotes remain byte-for-byte unchanged. Complete single-line HTML comments are recognized and preserved byte-for-byte without inspecting comment content; unclosed or multiline comments remain unsafe.

Multiline cell continuation lines are also preserved conservatively. The cell line immediately preceding a continuation is not split, while later independent safe rows can still format. Nested or unbalanced tables, tables inside templates, tables containing other protected placeholders, and genuinely unclear line structures remain preserved entirely.

Cell/header attribute analysis supports multiple quoted or unquoted ordinary attributes such as `colspan`, `rowspan`, `scope`, `class`, and `style`. Attributes stay on the first emitted cell and are never copied, reordered, or normalized. Separators inside quoted attribute values and uncertain attribute prefixes remain unsafe and prevent that line from being split. Row separator attributes such as `|- class="sortbottom"` are preserved exactly apart from trailing-whitespace cleanup.

Internal table analysis records meaningful skip reasons. They are never printed during normal operation; add `--debug` to an experimental table run to report which table start lines were formatted or skipped and why. Use `--safe` when enabling experimental table formatting on real pages so parsing and idempotency are verified before accepting output:

```sh
wikitext-fmt page.wiki --safe --debug --level experimental --format-tables
```

## Current limitations

- Only simple, one-line templates are expanded.
- Template parameters are not reordered.
- Multiline template parameter formatting is experimental, disabled by default, and limited to simple already-multiline templates.
- Only standalone category namespace aliases backed by the selected localization data are moved; categories are never sorted.
- List formatting is limited to safe spacing and trailing-whitespace cleanup on ordinary single-line items.
- File/image link formatting is limited to one safe standalone file link per line; captions and values are preserved.
- Interlanguage link movement is experimental, disabled by default, and limited to standalone unlabelled links with configured prefixes.
- Section spacing is experimental, disabled by default, and only applies around headings adjacent to ordinary paragraph text.
- Only aliases backed by built-in MediaWiki data, siteinfo, or explicit custom configuration participate in footer formatting.
- Experimental table formatting is disabled by default and only handles simple standalone wikitables.
- Unsafe template- or HTML-containing table lines are preserved even when other safe rows are formatted.
- Nested, unbalanced, template-contained, placeholder-containing, and structurally unclear tables are preserved entirely.
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
pnpm smoke
pnpm localization:update /path/to/mediawiki/languages/messages
```

`pnpm smoke` expects `pnpm build` to have run. It imports `dist/index.js`, runs `dist/cli.js --help`, checks that `loadSiteInfoAliases` is exported, verifies generated MediaWiki alias data is available from `dist`, and exercises `--print-localization-aliases --localization-source builtin` without network access.

GitHub Actions runs frozen pnpm installs, builds, and the complete test suite on Node.js 22 and 24 for every push and pull request.

The repository remains a single pnpm package. Core modules do not import the CLI; a workspace split is deferred until core and CLI need independent publication or dependency lifecycles.

Regression fixtures use this layout:

```text
tests/fixtures/<case>/input.wiki
tests/fixtures/<case>/expected.wiki
tests/fixtures/<case>/options.json # optional
tests/table-samples/<case>/input.wiki
tests/table-samples/<case>/expected.wiki
tests/real-pages/*.wiki
```

Table testing is intentionally layered:

- `tests/tables.test.ts` uses table-driven unit cases for heuristic decisions, diagnostics, and structural safety.
- Six compact fixtures cover exact user-visible formatter output without duplicating every internal decision reason.
- `tests/table-samples` contains realistic expected-diff calibrations for compact, sortable, mixed-style, template-containing, commented, and multiline-cell tables.
- Files under `real-pages` run in both default and experimental-table modes as broad regression guards.

Fixtures with table formatting opt in through `options.json`. Table samples verify exact calibrated output, while real-page tests do not require every table to change; preserving a complex table can be the correct conservative result.

Planned work includes a VS Code extension, a Prettier plugin, broader conservative table coverage, and improved site-specific parser configuration.

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

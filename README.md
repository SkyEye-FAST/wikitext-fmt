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
```

Without `--write`, formatted wikitext is written to stdout. `--check` writes nothing and exits with status 1 when a file would change. Available switches are:

```text
--write
--check
--stdin
--safe
--debug
--config <path>
--no-config
--level safe|normal|experimental
--html-void-tag-style html5|xhtml|preserve
--parser-config <name-or-json-path>
--no-format-headings
--no-format-templates
--no-format-categories
--format-tables
--no-format-tables
--no-normalize-blank-lines
```

Explicit files and glob patterns can be mixed. Expanded paths are deduplicated and processed in stable sorted order. Directories are not formatted, and an unmatched glob exits with status 2 and a clear error.

`--safe` enables parse-before, parse-after, and idempotency verification. If verification fails, the original input is returned and a warning is written to stderr. `--debug` writes the selected mode, rule level, and result status to stderr without contaminating formatted stdout.

Formatting levels are cumulative:

| Level | Enabled rules |
| --- | --- |
| `safe` | Heading spacing, blank-line normalization, and ordinary HTML void-tag normalization |
| `normal` | Safe rules, simple templates, and simple category movement |
| `experimental` | Safe and normal rules plus explicitly enabled experimental rules |

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
  "formatCategories": true,
  "formatTables": false,
  "normalizeBlankLines": true
}
```

Unknown keys and invalid option values are rejected instead of being silently ignored. Configuration discovery and loading are CLI concerns; the formatter core does not read files or inspect the working directory.

## API

```ts
import { formatWikitext, formatWikitextSafe } from "wikitext-fmt";

const output = formatWikitext(source, {
  parserConfig: "mediawiki",
  lineWidth: 120,
  formatHeadings: true,
  formatTemplates: true,
  formatCategories: true,
  formatTables: false,
  normalizeBlankLines: true,
  level: "normal",
  htmlVoidTagStyle: "html5",
});

const result = formatWikitextSafe(source);
if (result.warning) {
  console.warn(result.warning);
}
console.log(result.formatted);
```

`formatWikitextSafe()` never intentionally exposes parser or formatter exceptions. It verifies that input and output parse with WikiParser-Node and that formatting the output again is unchanged. On failure it returns `{ formatted: source, warning }`.

`formatWikitext()` remains the compact string-returning API. `formatWikitextResult()` exposes warnings without running the additional idempotency pass.

## Rule reliability

Every current rule has an exported reliability level in `ruleLevels`:

- `headings`: `safe`
- `blankLines`: `safe`
- `templates`: `normal`
- `categories`: `normal`
- `htmlVoidTags`: `safe`
- `tables`: `experimental`

`htmlVoidTagStyle` controls only simple, attribute-free `br`, `hr`, and `wbr` tags. Its default, `html5`, changes `<br />` to `<br>`. Use `xhtml` for `<br />` output or `preserve` to leave existing syntax unchanged. MediaWiki extension tags such as `<ref />` and `<references />` are never handled by this rule.

The levels describe formatter confidence, not a proof of semantic equivalence for arbitrary site-specific wikitext. Use an appropriate parser configuration and `formatWikitextSafe()` for automation over unfamiliar pages.

## Current limitations

- Only simple, one-line templates are expanded.
- Template parameters are not reordered.
- Only standalone `[[Category:...]]`, `[[分类:...]]`, and `[[分類:...]]` lines are moved, without sorting or namespace rewriting.
- Experimental table formatting is disabled by default and only handles simple standalone wikitables.
- Complex, nested, template-generated, tag-containing, ambiguous, or unbalanced tables are preserved unchanged.
- Table columns are not aligned or padded, and rows, cells, and attributes are never reordered.
- Single-block ignore handling is deliberately line/paragraph oriented. Range ignores are preferred for complex content.
- Site-specific syntax requires an appropriate parser configuration.

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
```

GitHub Actions runs frozen pnpm installs, builds, and the complete test suite on Node.js 22 and 24 for every push and pull request.

The repository remains a single pnpm package. Core modules do not import the CLI; a workspace split is deferred until core and CLI need independent publication or dependency lifecycles.

Regression fixtures use this layout:

```text
tests/fixtures/<case>/input.wiki
tests/fixtures/<case>/expected.wiki
tests/real-pages/*.wiki
```

Each fixture checks expected output and idempotency. Files under `real-pages` currently check parsing and idempotency, making it straightforward to add anonymized or redistributable real-world regressions later.

Planned work includes a VS Code extension, a Prettier plugin, broader conservative table coverage, and improved site-specific parser configuration.

## License

The project is released under the [GPL v3 License](LICENSE).

``` text
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

# wikitext-fmt

`wikitext-fmt` is a conservative, standalone formatter for MediaWiki wikitext. It uses [`wikiparser-node`](https://github.com/bhsd-harry/wikiparser-node) to parse and validate input, but it is not a MediaWiki extension and does not require a running MediaWiki installation.

The formatter intentionally handles only structures that can be changed with a small, predictable transformation. It does **not** guarantee that every wikitext construct will be formatted. Risky templates, tables, protected extension tags, and ignored regions are preserved rather than aggressively rewritten.

## Install and build

Node.js 20 or newer and pnpm are required.

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
```

Without `--write`, formatted wikitext is written to stdout. `--check` writes nothing and exits with status 1 when a file would change. Available switches are:

```text
--write
--check
--stdin
--safe
--debug
--level safe|normal|experimental
--html-void-tag-style html5|xhtml|preserve
--parser-config <name-or-json-path>
--no-format-headings
--no-format-templates
--no-format-categories
--no-normalize-blank-lines
```

`--safe` enables parse-before, parse-after, and idempotency verification. If verification fails, the original input is returned and a warning is written to stderr. `--debug` writes the selected mode, rule level, and result status to stderr without contaminating formatted stdout.

Formatting levels are cumulative:

| Level | Enabled rules |
| --- | --- |
| `safe` | Heading spacing and blank-line normalization |
| `normal` | Safe rules, simple templates, and simple category movement |
| `experimental` | Safe and normal rules plus future opt-in rules |

The default is `normal`. No experimental formatter rule is currently implemented or enabled by default. Tables remain a dangerous-structure signal and are never formatted.

The default parser configuration name is `mediawiki`, which maps to `wikiparser-node`'s generic `default` configuration. Names shipped by the parser, such as `enwiki` or `zhwiki`, and paths to custom JSON configurations are also accepted.

## API

```ts
import { formatWikitext, formatWikitextSafe } from "wikitext-fmt";

const output = formatWikitext(source, {
  parserConfig: "mediawiki",
  lineWidth: 120,
  formatHeadings: true,
  formatTemplates: true,
  formatCategories: true,
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

`htmlVoidTagStyle` controls only simple, attribute-free `br`, `hr`, and `wbr` tags. Its default, `html5`, changes `<br />` to `<br>`. Use `xhtml` for `<br />` output or `preserve` to leave existing syntax unchanged. MediaWiki extension tags such as `<ref />` and `<references />` are never handled by this rule.

The levels describe formatter confidence, not a proof of semantic equivalence for arbitrary site-specific wikitext. Use an appropriate parser configuration and `formatWikitextSafe()` for automation over unfamiliar pages.

## Current limitations

- Only simple, one-line templates are expanded.
- Template parameters are not reordered.
- Only standalone `[[Category:...]]` lines are moved, without sorting.
- Tables are preserved and are not formatted.
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
```

The repository remains a single pnpm package. Core modules do not import the CLI; a workspace split is deferred until core and CLI need independent publication or dependency lifecycles.

Regression fixtures use this layout:

```text
tests/fixtures/<case>/input.wiki
tests/fixtures/<case>/expected.wiki
tests/real-pages/*.wiki
```

Each fixture checks expected output and idempotency. Files under `real-pages` currently check parsing and idempotency, making it straightforward to add anonymized or redistributable real-world regressions later.

Planned work includes a VS Code extension, a Prettier plugin, safer table formatting, and improved site-specific parser configuration.

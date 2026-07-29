# Wikitext Formatter for VS Code

This extension wraps the `wikitext-fmt` core formatter. It requires VS Code
1.90 or newer.

## Installation

Marketplace publication is not implied by this repository. To install a local
build:

```sh
pnpm --filter wikitext-formatter vscode:package
```

Choose **Extensions: Install from VSIX...** and select the generated `.vsix`.

## Language and formatting support

- Contributes the `wikitext` language id for `.wiki`, `.wikitext`, and
  `.mediawiki`.
- Registers a whole-document formatter for `wikitext`.
- Also registers for `mediawiki` when another extension contributes that
  language id.
- Provides **Wikitext Formatter: Format Document**
  (`wikitext-fmt.formatDocument`).

Run **Format Document**, or enable format on save:

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

The `mediawiki` block applies only when another extension assigns that language
id.

## Safety behavior

`wikitextFmt.safe` defaults to `true`. The wrapper calls
`formatWikitextSafe`, which runs the core fail-closed base pipeline and then a
second formatting call to verify exact idempotency. Invalid configuration or a
core failure/warning produces a visible `wikitext-fmt:` warning and no edit.

When `wikitextFmt.safe` is `false`, the wrapper calls the compact
`formatWikitext` API. This omits the additional second call and does not expose
structured failures to the wrapper. It does **not** disable the base pipeline's
input/output parsing, exact round-trip checks, template/table convergence and
equivalence, final document equivalence, or original-source fallback.

Use the setting only for controlled development or investigation. Keep it
enabled for unfamiliar documents.

Core details:

- [Safety and diagnostics](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/docs/safety-and-diagnostics.md)
- [Formatting rules](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/docs/rules.md)
- [Configuration](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/docs/configuration.md)

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `wikitextFmt.safe` | `true` | Add the second idempotency-checking formatter call |
| `wikitextFmt.config.enabled` | `true` | Discover or load core JSON config |
| `wikitextFmt.config.path` | `null` | Select one explicit config path |
| `wikitextFmt.profile` | `"default"` | Select `default`, `production`, or `aggressive` |
| `wikitextFmt.level` | `"normal"` | Select the `safe`, `normal`, or `experimental` ceiling |
| `wikitextFmt.htmlVoidTagStyle` | `"html5"` | Select `html5`, `xhtml`, or `preserve` |
| `wikitextFmt.inlineTemplateSpacing` | `"auto"` | Select `auto`, `compact`, or `spaced` for single-line named templates |
| `wikitextFmt.formatTables` | `true` | Enable normal-level table formatting |
| `wikitextFmt.formatWikilinks` | `true` | Use spaces instead of underscores in eligible internal page-link targets |
| `wikitextFmt.formatReferences` | `false` | Enable experimental reference formatting |
| `wikitextFmt.formatExternalLinks` | `false` | Enable experimental external-link formatting |
| `wikitextFmt.formatSectionSpacing` | `false` | Enable experimental section spacing |
| `wikitextFmt.formatTemplateParameters` | `false` | Deprecated compatibility route to the template engine |

A profile is a preset; a reliability level is a rule ceiling. Only explicitly
configured VS Code settings override corresponding config-file values.

## Workspace configuration

The extension recognizes:

- `.wikitextfmtrc`
- `.wikitextfmtrc.json`
- `wikitext-fmt.config.json`

For file-backed documents, discovery starts at the document directory and walks
upward. In a multi-root workspace, a relative explicit
`wikitextFmt.config.path` resolves from the document's workspace folder. For a
document outside every workspace, it resolves from the document directory.
Untitled documents do not use filesystem discovery.

Precedence is:

```text
explicit VS Code setting > selected config option > profile preset > core default
```

Only settings listed above override config values. `wikitextFmt.safe` is
editor-only and is not a core `FormatOptions` key.

Disable loading:

```json
{
  "wikitextFmt.config.enabled": false
}
```

Select a workspace-relative file:

```json
{
  "wikitextFmt.config.path": "config/wikitext-fmt.json"
}
```

The extension does not fetch MediaWiki siteinfo. Use built-in or custom aliases;
a config that requests siteinfo without supplied aliases fails closed.

## Bundled core

The VSIX bundles `wikitext-fmt`, JavaScript runtime dependencies, and required
`wikiparser-node` config assets under `dist/node_modules/`. Installation does
not need the pnpm workspace or project dependencies.

Core and extension versions are independent. A new bundled core still requires
an extension release when formatting, diagnostics, safety, or runtime behavior
changes. See the
[versioning policy](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/docs/versioning.md).

## Limitations and troubleshooting

- Whole-document formatting only; no range formatting or format on type.
- No syntax highlighting, LSP server, code actions, or siteinfo fetching.
- `mediawiki` support depends on another extension contributing that language.
- CLI JSON diagnostics and batch reports are not exposed in editor UI.
- Safe/config failures appear as VS Code warning messages.

If formatting does nothing, check the language mode and default formatter, then
inspect any `wikitext-fmt:` warning. Temporarily disable config loading to
separate config errors from parser/formatter fallbacks.

## Build and package

From the repository root:

```sh
pnpm --filter wikitext-formatter typecheck
pnpm --filter wikitext-formatter build
pnpm --filter wikitext-formatter test
pnpm --filter wikitext-formatter test:extension
pnpm --filter wikitext-formatter test:vsix
pnpm --filter wikitext-formatter check:package-content
pnpm --filter wikitext-formatter check:release
pnpm --filter wikitext-formatter vscode:package
```

The build bundles the wrapper/core into `dist/extension.js` and copies parser
config assets. `vsce package --no-dependencies` creates a local VSIX; it does
not publish it.

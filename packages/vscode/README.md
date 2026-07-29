# Wikitext Formatter for VS Code

This extension is the VS Code wrapper for
[`wikitext-fmt`](../../README.md), a conservative parser-assisted MediaWiki
wikitext formatter. It requires VS Code 1.90 or newer.

## Installation

Marketplace publishing is manual and is not implied by this repository. To
install a locally built release, run:

```sh
pnpm --filter wikitext-formatter vscode:package
```

Then choose **Extensions: Install from VSIX...** in VS Code and select the
generated `.vsix`.

## Language and formatting support

The extension:

- contributes the `wikitext` language id for `.wiki`, `.wikitext`, and
  `.mediawiki` files;
- registers a whole-document formatter for `wikitext`;
- also registers for `mediawiki` when another extension contributes that
  language id;
- provides **Wikitext Formatter: Format Document**
  (`wikitext-fmt.formatDocument`).

Open a supported file and run **Format Document**. To enable format on save:

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

The `mediawiki` block is useful only when another installed extension assigns
that language id to the document.

## Safe formatting

Safe formatting is enabled by default. The wrapper uses the core formatter's
input/output parse checks, exact round-trip checks, template/table/document
equivalence, bounded convergence, and second-pass idempotency verification. If
configuration is invalid or the core rejects a candidate, VS Code shows a
`wikitext-fmt:` warning and applies no edit.

Turning off `wikitextFmt.safe` selects the core's compact single-pass API. This
is intended for development or controlled investigation; it removes the
wrapper's fail-closed guarantee.

See the core documentation for
[formatter behavior](../../README.md#formatter-contract),
[profiles and reliability](../../README.md#rule-reliability), and
[known limitations](../../README.md#current-limitations).

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `wikitextFmt.safe` | `true` | Require the full safe-formatting gate |
| `wikitextFmt.config.enabled` | `true` | Discover or load core JSON config |
| `wikitextFmt.config.path` | `null` | Use one explicit config path |
| `wikitextFmt.profile` | `"default"` | Select `default`, `production`, or `aggressive` |
| `wikitextFmt.level` | `"normal"` | Select `safe`, `normal`, or `experimental` rule ceiling |
| `wikitextFmt.htmlVoidTagStyle` | `"html5"` | Select `html5`, `xhtml`, or `preserve` |
| `wikitextFmt.formatTables` | `true` | Enable normal-level table formatting |
| `wikitextFmt.formatReferences` | `false` | Enable experimental reference formatting |
| `wikitextFmt.formatExternalLinks` | `false` | Enable experimental external-link formatting |
| `wikitextFmt.formatSectionSpacing` | `false` | Enable experimental section spacing |
| `wikitextFmt.formatTemplateParameters` | `false` | Deprecated compatibility alias for the unified template engine |

A profile is a preset; a reliability level is the maximum class of rule
allowed to run. Explicitly configured settings override corresponding values
from the selected config file.

## Workspace configuration

The extension reuses the core CLI's validated JSON filenames:

- `.wikitextfmtrc`
- `.wikitextfmtrc.json`
- `wikitext-fmt.config.json`

For a file-backed document, discovery starts in the document directory and
walks upward. In a multi-root workspace, a relative explicit
`wikitextFmt.config.path` resolves from that document's workspace folder. For a
document outside the workspace, it resolves from the document directory.
Untitled documents do not use filesystem discovery.

Precedence is:

```text
explicit VS Code setting > selected config file > profile preset > core default
```

Only settings exposed in the table above override config values.
`wikitextFmt.safe` is editor-only and is not a core `FormatOptions` key.

To disable config loading:

```json
{
  "wikitextFmt.config.enabled": false
}
```

To select a workspace-relative file:

```json
{
  "wikitextFmt.config.path": "config/wikitext-fmt.json"
}
```

The extension does not fetch MediaWiki siteinfo. Use built-in or custom aliases
in editor workflows; a config that requests siteinfo without supplying loaded
aliases fails closed.

## Bundled core and versioning

The VSIX bundles `wikitext-fmt`, its JavaScript runtime dependencies, and the
minimum `wikiparser-node` config assets under `dist/node_modules/`. An installed
extension does not need the pnpm workspace or project dependencies.

The extension and core have independent versions. An extension release must
still account for bundled-core changes that alter editor-visible formatting,
diagnostics, safety, or runtime behavior. See
[VERSIONING.md](../../VERSIONING.md).

## Limitations and troubleshooting

- This is a whole-document formatter; it does not provide range formatting,
  format-on-type, syntax highlighting, an LSP server, or code actions.
- It replaces the full document only when accepted output differs.
- `mediawiki` support depends on another extension contributing that language
  id; this extension itself contributes `wikitext`.
- It does not expose the CLI's JSON diagnostics or batch report UI. Safety and
  config failures appear as VS Code warning messages.
- Site-specific grammar still requires a suitable parser config, and
  site-specific aliases must be supplied without siteinfo fetching.

If formatting does nothing, check the document language mode, confirm this
extension is the selected default formatter, and inspect any `wikitext-fmt:`
warning. Temporarily disable config loading to distinguish config errors from
parser or formatter safety fallbacks. Keep safe mode enabled when diagnosing
unfamiliar input.

## Build and package

Run commands from the repository root:

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

`build` bundles the wrapper and core into `dist/extension.js`, leaving the VS
Code API and Node built-ins external, then copies required parser config assets.
`vsce package --no-dependencies` prepares a local VSIX; it does not publish it.

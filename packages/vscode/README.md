# Wikitext Formatter for VS Code

This is the initial VS Code wrapper for `wikitext-fmt`, a conservative MediaWiki wikitext formatter. The extension calls the existing `wikitext-fmt` core API; it does not duplicate formatter rules. The VSIX build is bundled, so installed extensions do not rely on pnpm workspace links being present at runtime.

## Features

- Contributes the `wikitext` language id for `.wiki`, `.wikitext`, and `.mediawiki` files.
- Registers Format Document support for `wikitext`.
- Also registers a formatter for the `mediawiki` language id when another extension provides that language.
- Provides the `wikitext-fmt.formatDocument` command.

This wrapper does not provide syntax highlighting, an LSP server, or siteinfo fetching. Packaging metadata is included, but publishing is intentionally manual.

## Usage

Open a `.wiki`, `.wikitext`, or `.mediawiki` file and run VS Code's Format Document command.

To enable format-on-save:

```json
{
  "[wikitext]": {
    "editor.defaultFormatter": "skyeyefast.wikitext-formatter",
    "editor.formatOnSave": true
  }
}
```

If you use another extension that contributes the `mediawiki` language id:

```json
{
  "[mediawiki]": {
    "editor.defaultFormatter": "skyeyefast.wikitext-formatter",
    "editor.formatOnSave": true
  }
}
```

## Settings

```json
{
  "wikitextFmt.safe": true,
  "wikitextFmt.config.enabled": true,
  "wikitextFmt.config.path": null,
  "wikitextFmt.level": "normal",
  "wikitextFmt.htmlVoidTagStyle": "html5",
  "wikitextFmt.formatTables": false,
  "wikitextFmt.formatReferences": false,
  "wikitextFmt.formatExternalLinks": false,
  "wikitextFmt.formatSectionSpacing": false,
  "wikitextFmt.formatTemplateParameters": false
}
```

When `wikitextFmt.safe` is enabled, formatting uses `formatWikitextSafe()` and returns no edit if the core formatter reports a warning.

## Configuration files

By default, the extension reuses the same JSON configuration files as the CLI:

- `.wikitextfmtrc`
- `.wikitextfmtrc.json`
- `wikitext-fmt.config.json`

For file-backed documents, config discovery starts at the document directory and walks upward. In multi-root workspaces, explicit relative `wikitextFmt.config.path` values are resolved from the document's workspace folder. If the document is outside every workspace, relative explicit paths and discovery use the document location. Untitled documents do not use filesystem config discovery and are formatted with VS Code settings only.

Precedence is:

```text
explicit VS Code settings > config file > formatter defaults
```

Only settings exposed by this extension override config values: `level`, `htmlVoidTagStyle`, `formatTables`, `formatReferences`, `formatExternalLinks`, `formatSectionSpacing`, and `formatTemplateParameters`. `wikitextFmt.safe` is editor-only and is not part of `FormatOptions`.

Disable config loading:

```json
{
  "wikitextFmt.config.enabled": false
}
```

Use an explicit config path:

```json
{
  "wikitextFmt.config.path": "config/wikitext-fmt.json"
}
```

## Build and package

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

`build` bundles `src/extension.ts`, `src/format.ts`, `wikitext-fmt`, and its JavaScript runtime dependencies into `dist/extension.js`; the VS Code API and Node built-ins remain external. It also copies the minimum `wikiparser-node` parser config assets needed at runtime under `dist/node_modules/` before `vsce package --no-dependencies` runs. Packaging is for local VSIX preparation only. Publishing is intentionally out of scope for this wrapper phase.

# wikitext-fmt for VS Code

This is the initial VS Code wrapper for `wikitext-fmt`, a conservative MediaWiki wikitext formatter. The extension calls the existing `wikitext-fmt` core API; it does not duplicate formatter rules.

## Features

- Contributes the `wikitext` language id for `.wiki`, `.wikitext`, and `.mediawiki` files.
- Registers Format Document support for `wikitext`.
- Also registers a formatter for the `mediawiki` language id when another extension provides that language.
- Provides the `wikitext-fmt.formatDocument` command.

This wrapper does not provide syntax highlighting, an LSP server, siteinfo fetching, or Marketplace publishing setup.

## Usage

Open a `.wiki`, `.wikitext`, or `.mediawiki` file and run VS Code's Format Document command.

To enable format-on-save:

```json
{
  "[wikitext]": {
    "editor.defaultFormatter": "skyeye-fast.wikitext-fmt-vscode",
    "editor.formatOnSave": true
  }
}
```

If you use another extension that contributes the `mediawiki` language id:

```json
{
  "[mediawiki]": {
    "editor.defaultFormatter": "skyeye-fast.wikitext-fmt-vscode",
    "editor.formatOnSave": true
  }
}
```

## Settings

```json
{
  "wikitextFmt.safe": true,
  "wikitextFmt.level": "normal",
  "wikitextFmt.htmlVoidTagStyle": "html5",
  "wikitextFmt.formatTables": false,
  "wikitextFmt.formatReferences": false,
  "wikitextFmt.formatSectionSpacing": false,
  "wikitextFmt.formatTemplateParameters": false
}
```

When `wikitextFmt.safe` is enabled, formatting uses `formatWikitextSafe()` and returns no edit if the core formatter reports a warning.

## Build and package

```sh
pnpm --filter wikitext-fmt-vscode build
pnpm --filter wikitext-fmt-vscode test
pnpm --filter wikitext-fmt-vscode package
```

Packaging uses `vsce package` for local VSIX preparation only. Publishing is intentionally out of scope for this wrapper phase.

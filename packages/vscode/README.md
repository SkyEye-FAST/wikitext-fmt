# Wikitext Formatter for VS Code

This extension wraps the `wikitext-fmt` core formatter. It requires VS Code
1.100 or newer.

It turns compact or inconsistent wikitext such as:

```wikitext
==Overview==
See [[Main_Page|main page]].
```

into:

```wikitext
== Overview ==
See [[Main Page|main page]].
```

## Installation

Install **Wikitext Formatter** from the Visual Studio Code Marketplace. In
VS Code, open **Extensions**, search for `Wikitext Formatter`, and choose
**Install**. The extension identifier is
`skyeyefast.wikitext-formatter`.

### Install a development VSIX manually

To test a development build from this repository:

```sh
pnpm --filter wikitext-formatter vscode:package
```

Choose **Extensions: Install from VSIX...** and select the generated `.vsix`.
This local packaging command does not publish the extension.

## Language and formatting support

- Contributes the `wikitext` language id for `.wiki`, `.wikitext`, and
  `.mediawiki`.
- Registers a whole-document formatter for `wikitext`.
- Also registers for `mediawiki` when another extension contributes that
  language id.
- Limits all document commands to those two language ids in both command
  metadata and runtime checks.

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

### Extension interface language

The extension interface supports English, Simplified Chinese, and Traditional
Chinese. It follows the VS Code Display Language. Command titles, setting
descriptions, notifications, and action buttons are localized through the
bundled `package.nls.json` and `l10n/bundle.l10n.json` catalogs. Formatter core
diagnostics, including failure messages, warnings, rule ids, and equivalence
reasons, remain in their original text and are not translated.

## Commands

- **Wikitext Formatter: Format Document** formats the active document.
- **Wikitext Formatter: Preview Document** opens a read-only diff without
  editing the source.
- **Wikitext Formatter: Check Document** runs the same resolution and formatter
  path without editing, then writes a concise report.
- **Wikitext Formatter: Show Last Report** reveals the latest document report in
  the **Wikitext Formatter** output channel.
- **Wikitext Formatter: Show Resolved Configuration** shows the active config
  path, explicit editor overrides, loaded config options, final core options,
  and editor-only safe value.
- **Wikitext Formatter: Open Configuration** opens the config file actually
  used by the active document. It reports when no file is active and does not
  create one.

Reports include structured failure code/stage data, the active configuration,
changed/unchanged/failed status, major rule counters, ambiguous/unsafe skip
counts, and available skip-reason summaries. Ordinary formatter skips are not
published to the Problems panel.

## Safety behavior

`wikitextFmt.safe` defaults to `true`. The wrapper calls
`formatWikitextSafeDetailed`, which runs the core fail-closed base pipeline and
then a second formatting call to verify exact idempotency. Invalid
configuration or a core failure/warning produces a visible `wikitext-fmt:`
warning with a **Show Details** action and no edit.

When `wikitextFmt.safe` is `false`, the wrapper calls the compact
`formatWikitextDetailedResult` API. This omits the additional second call while
retaining structured failures and detailed rule diagnostics. It does **not**
disable the base pipeline's input/output parsing, exact round-trip checks,
template/table convergence and equivalence, final document equivalence, or
original-source fallback.

Use the setting only for controlled development or investigation. Keep it
enabled for unfamiliar documents.

Core details:

- [Safety and diagnostics](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/docs/safety-and-diagnostics.md)
- [Formatting rules](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/docs/rules.md)
- [Configuration](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/docs/configuration.md)

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `wikitextFmt.profile` | `"default"` | Select `default`, `production`, or `aggressive` |
| `wikitextFmt.lineWidth` | `120` | Set the preferred width for parser-assisted layout |
| `wikitextFmt.formatHeadings` | `true` | Enable heading formatting |
| `wikitextFmt.formatTemplates` | `true` | Enable the unified template engine |
| `wikitextFmt.inlineTemplateSpacing` | `"auto"` | Select `auto`, `compact`, or `spaced` for single-line named templates |
| `wikitextFmt.templateParameterLayout` | `"flush"` | Select `compact`, `flush`, or `indented` multiline parameters |
| `wikitextFmt.formatTemplateParameters` | `false` | Deprecated compatibility route; use the unified template settings |
| `wikitextFmt.formatCategories` | `true` | Enable category and DEFAULTSORT footer formatting |
| `wikitextFmt.formatLists` | `true` | Enable list-marker formatting |
| `wikitextFmt.formatFileLinks` | `true` | Enable whole-line file-link formatting |
| `wikitextFmt.formatWikilinks` | `true` | Use spaces instead of underscores in eligible internal page-link targets |
| `wikitextFmt.formatExternalLinks` | `false` | Enable experimental external-link formatting |
| `wikitextFmt.formatReferences` | `false` | Enable experimental reference formatting |
| `wikitextFmt.formatInterlanguageLinks` | `false` | Enable experimental interlanguage-link formatting |
| `wikitextFmt.interlanguagePlacement` | `"preserve"` | Select `preserve` or `footer` placement |
| `wikitextFmt.interlanguagePrefixes` | built-in prefix list | Set recognized interlanguage prefixes |
| `wikitextFmt.formatSectionSpacing` | `false` | Enable experimental section spacing |
| `wikitextFmt.formatBehaviorSwitches` | `true` | Enable recognized behavior-switch formatting |
| `wikitextFmt.formatRedirects` | `true` | Enable redirect formatting |
| `wikitextFmt.behaviorSwitchPlacement` | `"preserve"` | Select `preserve` or `footer` placement |
| `wikitextFmt.localizedSyntaxStyle` | `"preserve"` | Preserve localized syntax or use `canonical-english` |
| `wikitextFmt.formatTables` | `true` | Enable normal-level table formatting |
| `wikitextFmt.tableCellSeparatorStyle` | `"auto"` | Select `auto`, `split`, or `preserve` |
| `wikitextFmt.normalizeBlankLines` | `true` | Enable conservative blank-line normalization |
| `wikitextFmt.level` | `"normal"` | Select the `safe`, `normal`, or `experimental` ceiling |
| `wikitextFmt.htmlVoidTagStyle` | `"html5"` | Select `html5`, `xhtml`, or `preserve` |
| `wikitextFmt.safe` | `true` | Add the second idempotency-checking formatter call |
| `wikitextFmt.config.enabled` | `true` | Discover or load core JSON config |
| `wikitextFmt.config.path` | `null` | Select one explicit config path |

A profile is a preset; a reliability level is a rule ceiling. Only explicitly
configured VS Code settings override corresponding config-file values.

Three advanced core options remain config-file-only:

- `parserConfig`, because named parser configurations and file paths have
  different resolution semantics;
- `localizationSource`, because `siteinfo` data must be supplied rather than
  fetched by the formatter;
- `localizationAliases`, because its nested object is more safely validated as
  one config-file value.

They remain fully supported through `.wikitextfmtrc`,
`.wikitextfmtrc.json`, or `wikitext-fmt.config.json`. Keeping them out of
ordinary VS Code settings avoids fragmented nested configuration and accidental
network expectations.

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

When `parserConfig` comes from a loaded config file, named configurations such
as `mediawiki` remain names. Absolute paths remain unchanged. Relative JSON or
path-like values resolve from the directory containing the config file, not
from the extension host's process working directory.

Precedence is:

```text
explicit VS Code setting > selected config option > profile preset > core default
```

The 26 core settings listed above can override matching config values.
`wikitextFmt.safe`, `wikitextFmt.config.enabled`, and
`wikitextFmt.config.path` are editor-only and are not core `FormatOptions`
keys. Package and unit checks fail when a future core option is neither exposed
nor explicitly classified as config-file-only.

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
- No workspace batch formatting or batch writes.
- `mediawiki` support depends on another extension contributing that language.
- Preview and check are read-only and always use the same configuration and
  detailed core call as normal formatting.
- Output-channel reports include list changes, skipped lines, the complete core
  `listDiagnostics` field names, and unified `lists: <reason>` skip reasons.
- Pure CRLF file documents retain CRLF through preview, formatting, and save.
  For clean UTF-8 files, the extension checks original bytes before VS Code
  normalizes its text model, so mixed LF/CRLF and bare CR remain unchanged and
  report `unsupported-line-endings`.
- Safe/config failures appear as VS Code warnings with output-channel details.

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

# Wikitext Formatter for VS Code

This extension provides parser-assisted, semantics-preserving MediaWiki
wikitext formatting through the `wikitext-fmt` core. It requires VS Code 1.100
or newer.

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
- **Wikitext Formatter: Refresh Site Configuration** fetches the configured
  MediaWiki site data, updates configured snapshot/cache files atomically, and
  reports the resolved result. It is enabled only in trusted workspaces and
  never edits project configuration.
- **Wikitext Formatter: Generate Site Parser Configuration** is an explicit,
  trusted-workspace operation. It confirms the target and security boundary,
  downloads the configured CodeMirror module, shows an existing-file diff, and
  writes ConfigData plus provenance only after confirmation.
- **Wikitext Formatter: Check Site Parser Configuration** regenerates in memory
  and reports semantic drift without writing files.

Reports include structured failure code/stage data, the active configuration,
changed/unchanged/failed status, major rule counters, ambiguous/unsafe skip
counts, and available skip-reason summaries. Ordinary formatter skips are not
published to the Problems panel. Reports also include site source, sanitized API
and parser precedence, paths, timestamp, stale state, applied data, and excluded
namespace-conflicting prefixes.

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
| `wikitextFmt.profile` | `"default"` | Select `default` or `production` |
| `wikitextFmt.lineWidth` | `120` | Set the maximum normalized single-line named-template candidate length; soft for anonymous parameters |
| `wikitextFmt.formatHeadings` | `true` | Enable heading formatting |
| `wikitextFmt.formatTemplates` | `true` | Enable the unified template engine |
| `wikitextFmt.inlineTemplateSpacing` | `"auto"` | Select `auto`, `compact`, or `spaced` for single-line named templates |
| `wikitextFmt.templateParameterLayout` | `"flush"` | Select `compact`, `flush`, or `indented` multiline parameters |
| `wikitextFmt.formatCategories` | `true` | Enable category and DEFAULTSORT footer formatting |
| `wikitextFmt.formatLists` | `true` | Enable list-marker formatting |
| `wikitextFmt.formatFileLinks` | `true` | Enable whole-line file-link formatting |
| `wikitextFmt.formatWikilinks` | `true` | Use spaces instead of underscores in eligible internal page-link targets |
| `wikitextFmt.formatExternalLinks` | `false` | Enable normal whole-line external-link formatting |
| `wikitextFmt.formatReferences` | `false` | Enable normal standalone self-closing reference formatting |
| `wikitextFmt.formatInterlanguageLinks` | `false` | Enable normal parser-confirmed interlanguage-link formatting |
| `wikitextFmt.interlanguagePlacement` | `"preserve"` | Select `preserve` or `footer` placement |
| `wikitextFmt.interlanguagePrefixes` | built-in prefix list | Set recognized interlanguage prefixes |
| `wikitextFmt.formatSectionSpacing` | `false` | Enable normal spacing between headings and adjacent content blocks |
| `wikitextFmt.formatBehaviorSwitches` | `true` | Enable recognized behavior-switch formatting |
| `wikitextFmt.formatRedirects` | `true` | Enable redirect formatting |
| `wikitextFmt.behaviorSwitchPlacement` | `"preserve"` | Select `preserve` or `footer` placement |
| `wikitextFmt.localizedSyntaxStyle` | `"preserve"` | Preserve localized syntax or use `canonical-english` |
| `wikitextFmt.formatTables` | `true` | Enable normal-level table formatting |
| `wikitextFmt.tableCellSeparatorStyle` | `"auto"` | Select `auto`, `split`, or `preserve` |
| `wikitextFmt.normalizeBlankLines` | `true` | Normalize large blank-line runs |
| `wikitextFmt.level` | `"normal"` | Select the `safe`, `normal`, or `experimental` ceiling |
| `wikitextFmt.htmlVoidTagStyle` | `"html5"` | Select `html5`, `xhtml`, or `preserve` |
| `wikitextFmt.safe` | `true` | Add the second idempotency-checking formatter call |
| `wikitextFmt.config.enabled` | `true` | Discover or load core JSON config |
| `wikitextFmt.config.path` | `null` | Select one explicit config path |
| `wikitextFmt.site.apiUrl` | `null` | Override the project MediaWiki API URL |
| `wikitextFmt.site.parserConfig` | `null` | Override the project site parser name or ConfigData JSON path |
| `wikitextFmt.site.snapshotPath` | `null` | Override the reproducible site snapshot path |
| `wikitextFmt.site.cachePath` | `null` | Override the persistent site cache path; otherwise use extension global storage |
| `wikitextFmt.site.cacheMaxAgeSeconds` | `null` | Override the project cache lifetime; zero revalidates once per extension process/refresh |
| `wikitextFmt.site.allowStaleCache` | `null` | Allow a valid expired cache only after network failure |

For named and explicitly numbered templates that start on one line, the
extension measures the final parser-safe candidate after applying
`inlineTemplateSpacing`. Candidates at or below `lineWidth` stay inline; wider
candidates use `templateParameterLayout`. Parameter count alone does not force
expansion, existing multiline templates remain multiline, and anonymous
parameters keep their separate conservative policy.

A profile is a preset; a reliability level is a rule ceiling. Only explicitly
configured VS Code settings override corresponding config-file values.
`production` enables all mature normal rules, including parser-confirmed
interlanguage-link movement with footer placement. The `experimental` ceiling
remains selectable for future rules, but no current rule uses it. The pre-1.0
`aggressive` profile has been removed.

Three advanced core options remain config-file-only:

- `parserConfig`, because named parser configurations and file paths have
  different resolution semantics;
- `localizationSource`, because it describes how already-resolved data is
  applied by the formatter;
- `localizationAliases`, because its nested object is more safely validated as
  one config-file value.

They remain fully supported through `.wikitextfmtrc`,
`.wikitextfmtrc.json`, `wikitext-fmt.config.json`, or `.wikitext-fmt.json`. Keeping them out of
ordinary VS Code settings avoids fragmented nested configuration and accidental
alias-object editing. Site acquisition policy has its own six explicit
`wikitextFmt.site.*` settings instead.

## Workspace configuration

The extension recognizes:

- `.wikitextfmtrc`
- `.wikitextfmtrc.json`
- `wikitext-fmt.config.json`
- `.wikitext-fmt.json`

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
explicit VS Code formatter/site setting > top-level project formatter option >
project site option > snapshot/siteinfo data > profile preset > core default
```

The 25 core settings listed above can override matching config values.
`wikitextFmt.safe`, `wikitextFmt.config.enabled`, `wikitextFmt.config.path`, and
the six site settings are wrapper/project controls, not core `FormatOptions`
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

### Site configuration and workspace trust

The extension uses the same project resolver as the CLI. It prefers a configured
snapshot, then fresh cache, network, and an explicitly allowed valid stale cache
after network failure. Persistent cache defaults to a hashed JSON file under the
extension's `globalStorageUri`, avoiding writes to the repository. Concurrent
format/check/preview resolutions for the same API share one request, and the
process memory cache prevents one request per document when TTL is zero.

In an untrusted workspace, the extension permits snapshot-only resolution but
disables network and persistent cache access. API-only projects fail closed with
a warning and no edit. The refresh command requires trust. Snapshot, cache, and
parser paths from the project config resolve from that config's directory;
explicit VS Code site paths resolve from the document workspace folder.

Siteinfo supplies normalized aliases and interlanguage prefixes, not an automatic
parser config. Configure `site.parserConfigGeneration` in the project file to
enable the two explicit parser-config commands. They require a trusted workspace,
show the target and remote-code safety notice, and run CodeMirror only in an
isolated child process. Format Document and format-on-save never invoke them.
Generated ConfigData and its `.meta.json` provenance should be committed. Use
`site.parserConfig` or top-level `parserConfig` for a named `wikiparser-node`
configuration or generated ConfigData JSON path. Explicit editor/core aliases or
prefixes win, and local parser namespaces exclude conflicting interlanguage
prefixes with a visible diagnostic.

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
- No syntax highlighting, LSP server, or code actions.
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

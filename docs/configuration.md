# Configuration

The CLI and VS Code wrapper load validated JSON into `FormatOptions`. The
formatter core accepts an options object but does not discover files or inspect
the working directory.

## Discovery and precedence

The CLI checks each directory from the current working directory upward, in
this filename order:

1. `.wikitextfmtrc`
2. `.wikitextfmtrc.json`
3. `wikitext-fmt.config.json`

The first existing file wins. `--config <path>` selects one file and disables
discovery; relative explicit paths resolve from the CLI working directory.
`--no-config` bypasses both discovery and loading.

Resolution has two stages:

1. the selected config is merged with explicitly supplied CLI option keys, with
   CLI values winning the same key;
2. the selected profile supplies preset values, then explicitly supplied
   option keys from config/CLI override that preset, then ordinary defaults
   fill the remainder.

Thus an individual config value can intentionally override its config profile,
and an individual CLI value overrides the same config key.

Unknown keys are rejected. Config must be a JSON object; booleans, enumerations,
positive `lineWidth`, non-empty `parserConfig`, non-empty string arrays, and
the nested localization alias shape are validated. Unknown behavior-switch IDs
are rejected.

## Option reference

“Profile” lists only non-default preset changes. Any explicit value overrides a
preset.

| Name | Type / allowed values | Default | Level | CLI equivalent | Profile interaction | Behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `profile` | `default` \| `production` \| `aggressive` | `default` | — | `--profile` | Selects preset | Coordinated option preset |
| `parserConfig` | non-empty string | `mediawiki` | — | `--parser-config` | unchanged | Parser config name or JSON path |
| `lineWidth` | number > 0 | `120` | — | config/API only | unchanged | Named-template layout threshold; soft for anonymous parameters |
| `formatHeadings` | boolean | `true` | safe | `--no-format-headings` | unchanged | Normalize eligible ASCII heading marker spacing while preserving non-ASCII title whitespace |
| `formatTemplates` | boolean | `true` | normal | `--no-format-templates` | production/aggressive: `true` | Run the unified template engine, including ASCII underscore-to-space normalization in stable ordinary invocation titles |
| `inlineTemplateSpacing` | `auto` \| `compact` \| `spaced` | `auto` | — | `--inline-template-spacing` | unchanged | Choose complete single-line named-template ASCII syntax spacing; auto uses weighted syntax-whitespace cost and a compact tie-break |
| `templateParameterLayout` | `compact` \| `flush` \| `indented` | `flush` | — | config/API only | unchanged | Choose multiline named/numbered parameter spacing and indentation |
| `formatCategories` | boolean | `true` | normal | `--no-format-categories` | unchanged | Format eligible footer categories/defaultsort |
| `formatLists` | boolean | `true` | normal | `--no-format-lists` | unchanged | Normalize eligible single-line list marker separators to exactly one ASCII space |
| `formatFileLinks` | boolean | `true` | normal | `--no-format-file-links` | unchanged | Format eligible whole-line file/image links |
| `formatWikilinks` | boolean | `true` | normal | `--no-format-wikilinks` | unchanged | Replace ASCII underscores with spaces only in eligible parser-confirmed internal page-title components |
| `formatExternalLinks` | boolean | `false` | experimental | `--format-external-links`, `--no-format-external-links` | production: `false`; aggressive: `true` | Normalize labelled whole-line external-link spacing |
| `formatReferences` | boolean | `false` | experimental | `--format-references`, `--no-format-references` | production: `false`; aggressive: `true` | Normalize standalone self-closing ref tags |
| `formatInterlanguageLinks` | boolean | `false` | experimental | `--format-interlanguage-links`, `--no-format-interlanguage-links` | unchanged | Recognize eligible interlanguage footer links |
| `interlanguagePlacement` | `preserve` \| `footer` | `preserve` | — | `--interlanguage-placement` | unchanged | Preserve or move recognized links |
| `interlanguagePrefixes` | non-empty string[] | `ar,de,en,es,fr,it,ja,ko,pl,pt,ru,uk,zh,zh-hans,zh-hant` | — | `--interlanguage-prefixes` | unchanged | Exact recognized prefix list |
| `formatSectionSpacing` | boolean | `false` | experimental | `--format-section-spacing`, `--no-format-section-spacing` | production: `false`; aggressive: `true` | Insert safe blank lines around headings |
| `formatBehaviorSwitches` | boolean | `true` | normal | `--no-format-behavior-switches` | unchanged | Format eligible standalone behavior switches |
| `formatRedirects` | boolean | `true` | normal | `--no-format-redirects` | unchanged | Normalize a safe first-line redirect |
| `behaviorSwitchPlacement` | `preserve` \| `footer` | `preserve` | — | `--behavior-switch-placement` | unchanged | Preserve or move recognized switches |
| `localizationSource` | `builtin` \| `siteinfo` \| `custom` | `builtin` | — | `--localization-source` | unchanged | Choose alias data source |
| `localizedSyntaxStyle` | `preserve` \| `canonical-english` | `preserve` | — | `--localized-syntax-style` | unchanged | Preserve recognized spelling or canonicalize certain keywords |
| `localizationAliases` | object | `{}` | — | config/API only | unchanged | Custom or preloaded site aliases |
| `formatTables` | boolean | `true` | normal | `--format-tables`, `--no-format-tables` | production/aggressive: `true` | Run parser-assisted table layout |
| `tableCellSeparatorStyle` | `auto` \| `split` \| `preserve` | `auto` | — | `--table-cell-separator-style` | production/aggressive: `auto` | Choose inline cell-separator layout |
| `normalizeBlankLines` | boolean | `true` | safe | `--no-normalize-blank-lines` | unchanged | Collapse 3+ blank lines to 2 |
| `level` | `safe` \| `normal` \| `experimental` | `normal` | — | `--level` | production: `normal`; aggressive: `experimental` | Maximum cumulative rule reliability |
| `htmlVoidTagStyle` | `html5` \| `xhtml` \| `preserve` | `html5` | safe | `--html-void-tag-style` | unchanged | Spell simple `br`/`hr`/`wbr` tags |

Template-title normalization has no separate option. With the template engine
enabled, `{{a_b_c|x=1}}` becomes `{{a b c|x=1}}`, subject to
`inlineTemplateSpacing`, `templateParameterLayout`, and `lineWidth`. Parser
functions, magic words, triple-brace parameters, dynamic template names, and
parameter keys and values are excluded.

Template formatting has one unified rule. `formatTemplates` enables or disables
it; `inlineTemplateSpacing`, `templateParameterLayout`, and `lineWidth` control
its supported layout behavior.

## Profiles versus levels

A profile changes selected options. A level only limits which reliability
classes may execute. Both the rule's boolean option and its level must allow it.

- `default` applies no preset overrides.
- `production` explicitly selects normal level, templates and tables, automatic
  table splitting, and leaves references, external links, and section spacing
  disabled.
- `aggressive` selects experimental level and enables references, external
  links, and section spacing in addition to templates and tables.

The aggressive profile does not enable interlanguage links automatically.

## Localization aliases

`localizationAliases` accepts:

```json
{
  "categoryNamespaces": ["Project category"],
  "fileNamespaces": ["Project file"],
  "defaultsortMagicWords": ["PROJECTSORT:"],
  "redirectMagicWords": ["#PROJECTREDIRECT"],
  "imageOptionAliases": {
    "img_thumbnail": ["projectthumb"]
  },
  "behaviorSwitches": {
    "notoc": ["__PROJECTNOTOC__"]
  }
}
```

Arrays must contain strings. Image-option maps use supported canonical option
IDs; behavior-switch maps use supported switch IDs. See
[Localization](localization.md) for merging, siteinfo, and output behavior.

## Core versus wrappers

`formatWikitext*` functions resolve an options object only. They do not read
JSON, discover a working directory, or fetch siteinfo. `discoverConfig`,
`loadConfig`, and `validateConfig` are public helpers, but callers choose
whether to invoke them. The CLI and VS Code wrapper own filesystem discovery;
only the CLI has built-in siteinfo fetching.

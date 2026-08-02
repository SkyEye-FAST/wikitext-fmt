# Configuration

The CLI and VS Code wrapper load validated JSON into `ProjectConfig`, which
extends the pure formatter `FormatOptions` shape with an optional `site`
object. The synchronous formatter accepts only `FormatOptions`; it does not
discover files, inspect the working directory, read snapshots, or use the
network.

## Discovery and precedence

The CLI checks each directory from the current working directory upward, in
this filename order:

1. `.wikitextfmtrc`
2. `.wikitextfmtrc.json`
3. `wikitext-fmt.config.json`
4. `.wikitext-fmt.json`

The first existing file wins. `--config <path>` selects one file and disables
discovery; relative explicit paths resolve from the CLI working directory.
`--no-config` bypasses both discovery and loading.

Resolution combines project, site, and formatter layers in this order (highest
priority first):

1. explicit CLI formatter/site values, or explicit VS Code settings;
2. top-level formatter options in the selected project config;
3. the project `site` object;
4. validated snapshot/siteinfo formatting data;
5. profile presets and ordinary defaults.

Thus an individual config value can intentionally override its config profile,
and an individual CLI value overrides the same config key.

Unknown keys are rejected. Config must be a JSON object; booleans, enumerations,
positive `lineWidth`, non-empty `parserConfig`, non-empty string arrays, and
the nested localization alias shape are validated. Unknown behavior-switch IDs
are rejected. The nested `site` object is also strict. Top-level and site
`parserConfig` paths plus `site.parserConfigGeneration.outputPath`,
`site.snapshotPath`, and `site.cachePath` resolve from
the directory containing the config file. Named parser configs remain names.

Parser selection is `CLI/editor override > top-level parserConfig >
site.parserConfig > mediawiki`. API selection is `--site-api` or explicit
editor setting, then `site.apiUrl`. Explicit localization aliases and
interlanguage prefixes override site data. If site data is configured and
`localizationSource` is omitted, site aliases are used; an explicit `builtin`
keeps built-in aliases but may still use site-derived interlanguage prefixes.

## Option reference

“Profile” lists only non-default preset changes. Any explicit value overrides a
preset.

| Name | Type / allowed values | Default | Level | CLI equivalent | Profile interaction | Behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `profile` | `default` \| `production` | `default` | — | `--profile` | Selects preset | Coordinated option preset |
| `parserConfig` | non-empty string | `mediawiki` | — | `--parser-config` | unchanged | Parser config name or JSON path |
| `lineWidth` | number > 0 | `120` | — | config/API only | unchanged | Maximum normalized single-line named-template candidate length; soft for anonymous parameters |
| `formatHeadings` | boolean | `true` | safe | `--no-format-headings` | unchanged | Normalize eligible ASCII heading marker spacing while preserving non-ASCII title whitespace |
| `formatTemplates` | boolean | `true` | normal | `--no-format-templates` | production: `true` | Run the unified template engine, including ASCII underscore-to-space normalization in stable ordinary invocation titles |
| `inlineTemplateSpacing` | `auto` \| `compact` \| `spaced` | `auto` | — | `--inline-template-spacing` | unchanged | Generate parser-safe single-line named-template candidates; auto filters by `lineWidth` before weighted syntax-whitespace cost and a compact tie-break |
| `templateParameterLayout` | `compact` \| `flush` \| `indented` | `flush` | — | config/API only | unchanged | Choose spacing and indentation after a named/numbered template must remain or become multiline |
| `formatCategories` | boolean | `true` | normal | `--no-format-categories` | unchanged | Format eligible footer categories/defaultsort |
| `formatLists` | boolean | `true` | normal | `--no-format-lists` | unchanged | Normalize eligible single-line list marker separators to exactly one ASCII space |
| `formatFileLinks` | boolean | `true` | normal | `--no-format-file-links` | unchanged | Format eligible whole-line file/image links |
| `formatWikilinks` | boolean | `true` | normal | `--no-format-wikilinks` | unchanged | Replace ASCII underscores with spaces only in eligible parser-confirmed internal page-title components |
| `formatExternalLinks` | boolean | `false` | normal | `--format-external-links`, `--no-format-external-links` | production: `true` | Normalize labelled whole-line external-link spacing |
| `formatReferences` | boolean | `false` | normal | `--format-references`, `--no-format-references` | production: `true` | Normalize standalone self-closing ref tags |
| `formatInterlanguageLinks` | boolean | `false` | normal | `--format-interlanguage-links`, `--no-format-interlanguage-links` | production: `true` | Recognize parser-confirmed interlanguage footer links |
| `interlanguagePlacement` | `preserve` \| `footer` | `preserve` | — | `--interlanguage-placement` | production: `footer` | Preserve or move recognized links |
| `interlanguagePrefixes` | non-empty string[] | `ar,de,en,es,fr,it,ja,ko,pl,pt,ru,uk,zh,zh-hans,zh-hant` | — | `--interlanguage-prefixes` | unchanged | Authoritative prefix list; siteinfo may supply it in the CLI |
| `formatSectionSpacing` | boolean | `false` | normal | `--format-section-spacing`, `--no-format-section-spacing` | production: `true` | Insert missing blank lines between headings and adjacent content blocks |
| `formatBehaviorSwitches` | boolean | `true` | normal | `--no-format-behavior-switches` | unchanged | Format eligible standalone behavior switches |
| `formatRedirects` | boolean | `true` | normal | `--no-format-redirects` | unchanged | Normalize a safe first-line redirect |
| `behaviorSwitchPlacement` | `preserve` \| `footer` | `preserve` | — | `--behavior-switch-placement` | unchanged | Preserve or move recognized switches |
| `localizationSource` | `builtin` \| `siteinfo` \| `custom` | `builtin` | — | `--localization-source` | unchanged | Choose alias data source |
| `localizedSyntaxStyle` | `preserve` \| `canonical-english` | `preserve` | — | `--localized-syntax-style` | unchanged | Preserve recognized spelling or canonicalize certain keywords |
| `localizationAliases` | object | `{}` | — | config/API only | unchanged | Custom or preloaded site aliases |
| `formatTables` | boolean | `true` | normal | `--format-tables`, `--no-format-tables` | production: `true` | Run parser-assisted table layout |
| `tableCellSeparatorStyle` | `auto` \| `split` \| `preserve` | `auto` | — | `--table-cell-separator-style` | production: `auto` | Split inline `\|\|`/`!!`, or retain only those separators while still normalizing other safe table layout |
| `normalizeBlankLines` | boolean | `true` | safe | `--no-normalize-blank-lines` | unchanged | Collapse 3+ blank lines to 2 |
| `level` | `safe` \| `normal` \| `experimental` | `normal` | — | `--level` | production: `normal` | Maximum cumulative rule reliability |
| `htmlVoidTagStyle` | `html5` \| `xhtml` \| `preserve` | `html5` | safe | `--html-void-tag-style` | unchanged | Spell simple `br`/`hr`/`wbr` tags |

Template-title normalization has no separate option. With the template engine
enabled, `{{a_b_c|x=1}}` becomes `{{a b c|x=1}}`, subject to
`inlineTemplateSpacing`, `templateParameterLayout`, and `lineWidth`. Parser
functions, magic words, triple-brace parameters, dynamic template names, and
parameter keys and values are excluded.

Template formatting has one unified rule. `formatTemplates` enables or disables
it; `inlineTemplateSpacing`, `templateParameterLayout`, and `lineWidth` control
its supported layout behavior.

For an originally single-line named or explicitly numbered template, the
formatter measures the final parser-safe candidate rather than the raw source.
A candidate whose length is at most `lineWidth` stays inline; a wider candidate
becomes multiline. Parameter count, redundant source whitespace, and the mere
presence of a nested structure do not independently force expansion. Templates
that were already multiline remain multiline, and anonymous parameters continue
to use their separate conservative policy.

## Profiles versus levels

A profile changes selected options. A level only limits which reliability
classes may execute. Both the rule's boolean option and its level must allow it.

- `default` applies the standard interactive defaults. Normal rules whose
  individual switches default to off remain available as explicit opt-ins.
- `production` selects normal level and enables every mature normal rule,
  including references, external links, section spacing, templates, tables with
  automatic table splitting, and parser-confirmed interlanguage links with
  footer placement. It is the preset intended for automation.

The `experimental` level remains a valid cumulative ceiling for future rules,
but no current rule uses it. The pre-1.0 `aggressive` profile has been removed
and is rejected rather than silently mapped to another preset.

`interlanguagePrefixes` is an authorization list, not a textual recognition
hint. The rule additionally requires the parser to classify the exact link as
interwiki. The CLI can derive the list from siteinfo; an explicit config or CLI
value overrides that result. Prefixes that conflict with local namespaces are
not injected into the parser session.

## Site configuration

`ProjectConfig.site` accepts exactly these keys:

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `apiUrl` | absolute HTTP(S) URL without credentials | — | MediaWiki API endpoint used for normalized formatter data |
| `parserConfig` | non-empty name or ConfigData JSON path | — | Site parser selection below the top-level/explicit parser option |
| `parserConfigGeneration` | strict object | — | Explicit CodeMirror parser-config generation policy; never used during ordinary formatting |
| `snapshotPath` | non-empty path | — | Reproducible schema-versioned site snapshot |
| `cachePath` | non-empty path | CLI: memory only; VS Code: global storage | Persistent site cache |
| `cacheMaxAgeSeconds` | finite number >= 0 | `86400` | Persistent-cache freshness lifetime |
| `allowStaleCache` | boolean | `false` | Permit a valid expired cache only after network failure |

```json
{
  "profile": "production",
  "site": {
    "apiUrl": "https://wiki.example/w/api.php",
    "parserConfig": "zhwiki",
    "snapshotPath": "site/wiki.example.json",
    "cachePath": ".cache/wiki.example.json",
    "cacheMaxAgeSeconds": 86400,
    "allowStaleCache": true
  }
}
```

Resolution order is deterministic: explicit snapshot, fresh process/disk cache,
network, then an allowed valid stale cache after network failure. A corrupt,
unsupported-version, or API-mismatched cache is never used. Network failure
without an eligible stale cache is an error; it never silently falls back to
built-in aliases. Cache writes use a temporary file and atomic rename. Without
an explicit CLI cache path, only the in-process cache is used. VS Code derives a
hashed default cache filename under `ExtensionContext.globalStorageUri`.

`cacheMaxAgeSeconds: 0` revalidates once in each new process and on explicit
refresh, while the process memory cache prevents one request per formatted
file/document. Concurrent resolutions of the same API share one request.

### Snapshot schema

Snapshots contain only normalized formatter data, never raw siteinfo or parser
configuration:

```json
{
  "schemaVersion": 1,
  "apiUrl": "https://wiki.example/w/api.php",
  "fetchedAt": "2026-08-02T00:00:00.000Z",
  "formatterData": {
    "localizationAliases": {},
    "interlanguagePrefixes": ["de", "en"]
  }
}
```

Serialization is stable two-space JSON with a final newline and preserves
normalized array order. Stored and printed API URLs omit credentials, query,
and fragment data. Unsupported schema versions and URL mismatches are rejected.
### Explicit parser-config generation

Site snapshots contain formatter aliases and interlanguage prefixes; they are not
parser configurations. Generate a parser `ConfigData` file only through the
explicit Node API, CLI mode, or trusted VS Code command. Normal formatting,
format-on-save, cache misses, `--write`, `--check`, and
`--refresh-site-configuration` never download or execute CodeMirror JavaScript.

`site.parserConfigGeneration` accepts only these keys: `method` (`"codemirror"`),
`scriptPath` (an absolute credential-free HTTP(S) URL), `outputPath`,
`timeoutMilliseconds` (a positive integer; default `10000`), and
`maxModuleBytes` (a positive integer; default `5000000`). Unknown keys are
rejected. When no `scriptPath` is given, it is derived only when `apiUrl` ends
in `/api.php`; otherwise an explicit script path is required. `outputPath` is
relative to the project config. If it is omitted, `site.parserConfig` must be an
explicit JSON path.

```json
{
  "profile": "production",
  "site": {
    "apiUrl": "https://wiki.arcaea.cn/api.php",
    "parserConfig": "./config/wiki.arcaea.cn.parser.json",
    "parserConfigGeneration": {
      "method": "codemirror",
      "outputPath": "./config/wiki.arcaea.cn.parser.json",
      "timeoutMilliseconds": 10000,
      "maxModuleBytes": 5000000
    },
    "snapshotPath": "./config/wiki.arcaea.cn.site.json"
  }
}
```

Generation fetches the site's CodeMirror ResourceLoader module and raw parser
siteinfo, validates the generated data with the installed `wikiparser-node`, and
runs parser round-trip smoke tests. The downloaded module runs only in a fresh,
permission-restricted child process after its full bounded download and SHA-256
calculation. The child has no network permission and can read only its temporary
directory; its output, timeout, and cleanup are bounded. The generator writes
pure two-space `ConfigData` JSON plus `<outputPath>.meta.json`, whose provenance
records sanitized URLs, timestamp, generator/parser versions, and CodeMirror,
siteinfo, and config hashes. Commit both files and use the check command in CI.
The transformation uses the public `@bhsd/cm-util` API (version `2.2.0`, MIT),
the same compatible algorithm family used by locked `wikiparser-node@1.44.0`.

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
JSON, discover a working directory, or fetch siteinfo. `validateProjectConfig`
and the snapshot normalization/serialization helpers are browser-safe.
`discoverConfig`, `loadProjectConfig`, `loadSiteConfigurationSnapshot`, and
`resolveProjectConfiguration` are Node-only helpers. The CLI and VS Code wrapper
both use that same resolver; the VS Code wrapper additionally enforces workspace
trust before network or persistent-cache access.

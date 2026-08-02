# Localization

Localization recognizes MediaWiki syntax aliases; it does not translate user
content. Alias matching is data-driven from built-in data, MediaWiki siteinfo,
or explicit custom configuration.

## Alias families

The resolved alias set contains:

- category namespace names and aliases;
- file/image namespace names and aliases;
- `defaultsort` and redirect magic-word aliases;
- behavior-switch aliases keyed by supported canonical IDs;
- image-option aliases such as thumbnail and alignment keywords.

Canonical English syntax is always present. Arrays and alias maps are
deduplicated when sources are merged.

## Built-in aliases

`localizationSource: "builtin"` is the default. It combines canonical English
with generated MediaWiki core data for:

```text
ar de es fr it ja ko pl pt ru uk zh-hans zh-hant
```

The generated file comes from selected MediaWiki core message files through:

```sh
pnpm localization:update /path/to/mediawiki/languages/messages
```

The updater extracts namespace names/aliases and selected magic words,
behavior switches, and image options, then writes deterministic normalized JSON
with provenance fields. Review generated changes; do not edit the generated
alias JSON by hand.

## Site configuration and siteinfo aliases

The CLI supports:

```sh
wikitext-fmt page.wiki \
  --localization-source siteinfo \
  --site-api https://wiki.example/w/api.php
```

The preferred reproducible project form keeps API and snapshot policy in
configuration:

```json
{
  "site": {
    "apiUrl": "https://wiki.example/w/api.php",
    "snapshotPath": "site/wiki.example.json",
    "cacheMaxAgeSeconds": 86400
  }
}
```

Use `wikitext-fmt --refresh-site-configuration` to update the snapshot
atomically and commit it when reproducible CI is required. Normal resolution
prefers the explicit snapshot, then fresh cache, network, and finally an
explicitly allowed valid stale cache after network failure. Snapshot and cache
failures do not silently select built-in data.

It sends a read-only `GET` request for:

```text
action=query
meta=siteinfo
siprop=namespaces|namespacealiases|magicwords|doubleunderscores|interwikimap
format=json
formatversion=2
```

The response is validated and normalized. Namespace IDs 6 and 14 supply file
and category names/aliases; magic words supply defaultsort, redirect, and image
options; double-underscore declarations gate behavior-switch extraction.
`interwikimap` entries marked `language` or `extralanglink` supply the
authoritative interlanguage-prefix list in API order. Generic `local` or
`localinterwiki` entries without either language marker are excluded.
Missing required category namespace data, invalid payloads, network failures,
or non-success HTTP responses stop the CLI with exit 2. It never silently falls
back to built-in aliases.

The formatter core does not fetch siteinfo. API consumers call:

```ts
import { formatWikitextSafe, loadSiteInfoFormattingData } from "wikitext-fmt";

const siteinfo = await loadSiteInfoFormattingData(
  "https://wiki.example/w/api.php",
);
const result = formatWikitextSafe(source, {
  localizationSource: "siteinfo",
  localizationAliases: siteinfo.localizationAliases,
  interlanguagePrefixes: siteinfo.interlanguagePrefixes,
});
```

`loadSiteInfoAliases` remains available as an alias-only compatibility helper,
and `normalizeSiteInfoFormattingPayload` exposes the combined normalizer.
Selecting `siteinfo` without supplying aliases fails closed. In the unified
project resolver, configuring site data while omitting `localizationSource`
selects the normalized site aliases automatically. Explicit `builtin` retains
built-in aliases, but the API/snapshot may still provide interlanguage prefixes.
Explicit `localizationAliases` and `interlanguagePrefixes` from config, CLI, or
VS Code take precedence over site data, including the decision not to treat
generic interwiki prefixes as languages.

## Custom aliases

`localizationSource: "custom"` combines canonical English with
`localizationAliases`. Custom aliases can also override conflicting
behavior-switch spellings:

```json
{
  "localizationSource": "custom",
  "localizationAliases": {
    "categoryNamespaces": ["Project category"],
    "fileNamespaces": ["Project file"],
    "defaultsortMagicWords": ["PROJECTSORT:"],
    "redirectMagicWords": ["#PROJECTREDIRECT"],
    "imageOptionAliases": {
      "img_thumbnail": ["projectthumb"],
      "img_right": ["projectright"]
    },
    "behaviorSwitches": {
      "notoc": ["__PROJECTNOTOC__"]
    }
  }
}
```

Config validation rejects unknown nested keys, invalid arrays, unsupported
image-option IDs, and unsupported behavior-switch IDs.

## Preserve versus canonical English

`localizedSyntaxStyle: "preserve"` recognizes aliases while keeping their exact
spelling.

`"canonical-english"` may rewrite only certainly matched syntax keywords:

- category/file namespace alias → `Category`/`File`;
- defaultsort alias → `DEFAULTSORT`;
- redirect alias → `#REDIRECT`;
- recognized image option → canonical English option name;
- behavior switch → canonical supported ID.

Page titles, redirect targets, file names, captions, category names, sort keys,
template arguments, link labels, attribute values, and prose are never
translated. Keywords without a certain alias match remain unchanged.

Canonicalization diagnostics count keyword rewrites, not mere movement. In
footer mode, duplicate behavior-switch aliases that emit the same canonical
value are deduplicated.

## Inspect resolved aliases

```sh
wikitext-fmt --print-localization-aliases
wikitext-fmt --print-localization-aliases \
  --localization-source siteinfo \
  --site-api https://wiki.example/w/api.php
```

This mode prints JSON without reading formatter input. It still resolves config
and, when needed, resolves the project snapshot/cache/API. Use
`--print-site-configuration` to inspect source, freshness, paths, parser choice,
overrides, and normalized formatter data without exposing API query secrets.

## Parser configuration is separate

Localization data teaches formatter rules which source spellings are aliases.
It does not otherwise change the parser grammar. For interlanguage links, the
formatter creates an invocation-local parser configuration from the
authoritative prefix list so acceptance still depends on parser classification;
prefixes conflicting with local namespaces are excluded. Other site-specific
syntax may still require an appropriate `parserConfig`.

Siteinfo never synthesizes a complete parser config. Configure a named
`wikiparser-node` parser or a `ConfigData` JSON path through top-level
`parserConfig` or `site.parserConfig`. The top-level/explicit parser wins. Local
namespace names from that parser config win over conflicting interlanguage
prefixes, and the resolver exposes the exclusions as diagnostics.

## Corpus siteinfo metadata

The corpus builder stores:

- the raw siteinfo response in `metadata/siteinfo.raw.json`;
- the exact normalized `FormatOptions.localizationAliases` value in
  `metadata/localization-aliases.json`;
- references to both in `manifest.json`.

The corpus runner accepts only normalized executable aliases, not raw siteinfo.
This keeps source evidence separate from formatter configuration.

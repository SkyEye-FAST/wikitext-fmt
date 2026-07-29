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

## Siteinfo aliases

The CLI supports:

```sh
wikitext-fmt page.wiki \
  --localization-source siteinfo \
  --site-api https://wiki.example/w/api.php
```

It sends a read-only `GET` request for:

```text
action=query
meta=siteinfo
siprop=namespaces|namespacealiases|magicwords|doubleunderscores
format=json
formatversion=2
```

The response is validated and normalized. Namespace IDs 6 and 14 supply file
and category names/aliases; magic words supply defaultsort, redirect, and image
options; double-underscore declarations gate behavior-switch extraction.
Missing required category namespace data, invalid payloads, network failures,
or non-success HTTP responses stop the CLI with exit 2. It never silently falls
back to built-in aliases.

The formatter core does not fetch siteinfo. API consumers call:

```ts
import { formatWikitextSafe, loadSiteInfoAliases } from "wikitext-fmt";

const aliases = await loadSiteInfoAliases(
  "https://wiki.example/w/api.php",
);
const result = formatWikitextSafe(source, {
  localizationSource: "siteinfo",
  localizationAliases: aliases,
});
```

Selecting `siteinfo` without supplying aliases fails closed.

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
and, for siteinfo, performs the API request.

## Parser configuration is separate

Localization data teaches formatter rules which source spellings are aliases.
It does not change the parser grammar. Site-specific syntax may also require an
appropriate `parserConfig`.

## Corpus siteinfo metadata

The corpus builder stores:

- the raw siteinfo response in `metadata/siteinfo.raw.json`;
- the exact normalized `FormatOptions.localizationAliases` value in
  `metadata/localization-aliases.json`;
- references to both in `manifest.json`.

The corpus runner accepts only normalized executable aliases, not raw siteinfo.
This keeps source evidence separate from formatter configuration.

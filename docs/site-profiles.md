# Site profiles

A site profile is a JSON document describing one MediaWiki site. It supplies
client metadata and explicit formatter options. It does not change formatter
defaults or resolve parser configurations.

```json
{
  "$schema": "https://unpkg.com/wikitext-fmt/schemas/site-profile.schema.json",
  "schemaVersion": 1,
  "name": "Example Wiki",
  "apiUrl": "https://wiki.example.org/w/api.php",
  "articlePath": "https://wiki.example.org/wiki/$1",
  "extensions": { "templateData": true },
  "interwiki": [
    { "prefix": "en", "url": "https://en.example.org/wiki/$1", "language": "English" }
  ],
  "templates": {
    "Infobox": {
      "description": { "en": "An infobox" },
      "params": { "name": { "label": "Name", "type": "string", "suggested": true } },
      "paramOrder": ["name"],
      "format": "block"
    }
  },
  "formatter": { "lineWidth": 100 }
}
```

## Fields

Only `schemaVersion` (exactly `1`) and a non-empty `name` are required.
`$schema` is ignored. The schema is also exported as
`wikitext-fmt/schemas/site-profile.schema.json`.

- `apiUrl`: optional absolute HTTP(S) API URL without credentials, validated by
  `validateSiteApiUrl`.
- `articlePath`: optional absolute HTTP(S) URL without credentials containing
  the literal `$1` placeholder.
- `extensions.templateData`: defaults to `true`. When `false`, clients must
  not query Extension:TemplateData.
- `interwiki`: optional entries with a required prefix, trimmed and converted
  to lowercase. `url` and `language` are optional strings; `local` is an optional
  boolean. Presence of `language` marks an interlanguage prefix. Interwiki URLs
  are retained as supplied, including protocol-relative URLs.
- `templates`: optional map keyed by template titles without their namespace.
  Values use TemplateData JSON: `description`, `params`, `paramOrder`, and
  `format`. Parameters model `label`, `description`, `type`, `required`,
  `suggested`, `deprecated`, `aliases`, `default`, `example`, `autovalue`, and
  `suggestedvalues`. Text fields accept strings or language-to-string objects
  (`InterfaceText`); `type` and `format` are strings. `deprecated` accepts a
  boolean or string; `required` and `suggested` are booleans. `paramOrder`,
  `aliases`, and `suggestedvalues` are string arrays. `sets`, `maps`, and other
  unmodeled TemplateData fields are copied as opaque JSON, including parameter
  fields added by extensions.
- `formatter`: optional [formatter options](configuration.md). Validation
  reuses `validateProjectConfig`; `parserConfig` and `site` are rejected.

Unknown keys outside the open TemplateData objects are errors. Validation
errors identify the affected JSON path. Normalization returns a separate copy
with `extensions.templateData` always present.

## API

All types and functions below are exported by both `wikitext-fmt` and
`wikitext-fmt/browser`, including in Web Workers.

| Function | Behavior |
| --- | --- |
| `normalizeSiteProfile(value: unknown): SiteProfile` | Validates and copies a profile. |
| `serializeSiteProfile(profile: SiteProfile): string` | Validates, sorts object keys, and writes JSON with two-space indentation and a trailing newline. Array order is preserved. |
| `siteProfileFormatOptions(profile: SiteProfile): FormatOptions` | Copies `formatter`, deriving deduplicated interlanguage prefixes from entries with `language` if the option is absent. An explicit empty list wins. |
| `siteProfileTemplateDataUrl(apiUrl: string, titles: readonly string[], language?: string): URL` | Builds a TemplateData request with redirects, missing titles, JSON format version 2, `origin=*`, and optional `lang`. Adds `Template:` to titles without a colon. |
| `normalizeTemplateDataResponse(payload: unknown): Record<string, SiteProfileTemplate>` | Converts API `pages` keyed by page ID into templates. Skips missing pages and strips each title through its first colon, including localized namespaces. |
| `loadSiteProfile(apiUrl: string, fetchImplementation: typeof fetch = fetch): Promise<SiteProfile>` | Makes one siteinfo request for general data, namespaces, namespace aliases, magic words, double underscores, interwiki map, and extensions. Does not fetch TemplateData. |

`loadSiteProfile` sets the name from `general.sitename` and resolves
`general.articlepath` against `general.server`; protocol-relative servers use
the API URL's protocol. It detects `TemplateData` in the extension list and
reuses siteinfo normalization for formatter localization aliases and
interlanguage prefixes. Both request builders include `origin=*` for anonymous CORS
requests. Network and API failures reject the loader promise.

Public types are `SiteProfile`, `SiteProfileInterwiki`, `SiteProfileTemplate`,
`SiteProfileTemplateParameter`, and `InterfaceText`.

```ts
import {
  loadSiteProfile,
  siteProfileFormatOptions,
  formatWikitextSafe,
} from "wikitext-fmt/browser";

const profile = await loadSiteProfile("https://wiki.example.org/w/api.php");
const result = formatWikitextSafe(source, siteProfileFormatOptions(profile));
```

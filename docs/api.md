# JavaScript API

The package root and browser subpath are public:

```ts
import { formatWikitextSafe } from "wikitext-fmt";
import { formatWikitextSafe as formatInBrowser } from "wikitext-fmt/browser";
```

Files under `src/`, including parser contexts and `resolveOptions`, are
implementation details even if a source checkout makes them importable.

All public surfaces remain subject to the
[pre-1.0 compatibility policy](versioning.md).

## Browser entry

`wikitext-fmt/browser` is a browser-safe static dependency graph suitable for
modern browser applications and Web Workers. It has no dependency on Node.js
built-ins, `fast-glob`, the CLI, filesystem config discovery, or the VS Code
extension. It uses the browser-compatible `wikiparser-node` runtime and the same
formatter implementation and safety pipeline as the Node.js entry.

Browser runtime execution does not require Node.js. Installing the npm package
and producing an application bundle still happen in a package-manager/build
environment governed by package metadata; use the supported Node.js 22.13+ or
24.11+ lines for that build environment.

Its runtime exports are:

- `formatWikitext`, `formatWikitextResult`, `formatWikitextDetailedResult`,
  `formatWikitextSafe`, and `formatWikitextSafeDetailed`;
- `defaultOptions` and `ruleLevels`;
- `loadSiteInfoAliases`, `normalizeSiteInfoPayload`, and
  `classifyParserFunction`;
- `validateProjectConfig`, `normalizeSiteConfigurationSnapshot`,
  `serializeSiteConfigurationSnapshot`, `sanitizedSiteApiUrl`, and
  `applySiteFormattingData`.

It also exports `FormatResult`, `FormatDetailedResult`, `FormatFailure`,
`FormatFailureCode`, all public rule diagnostic types, `DiagnosticsSummary`,
`FormatOptions`, `FormatProfile`, `FormatLevel`, every public option union,
`LocalizationAliases`, `ResolvedLocalizationAliases`, `RuleName`, structural
equivalence result types, `ProjectConfig`, `SiteConfiguration`, snapshot and
resolved-site types, and parser-function policy types as TypeScript types.
It does not export filesystem configuration helpers or standalone structural
equivalence functions.

```ts
import { formatWikitextSafe } from "wikitext-fmt/browser";

self.onmessage = (event) => {
  self.postMessage(formatWikitextSafe(event.data));
};
```

Omitted `parserConfig`, `mediawiki`, and `default` use the bundled MediaWiki
configuration. Other names, relative JSON paths, and absolute filesystem paths
are unavailable in browsers. Result APIs return the original source with
`failure.code === "unsupported-parser-config"` and `stage === "parser-config"`;
safe APIs do not throw for this ordinary unsupported input. The string API also
returns the original source. Formatting and parser assets stay local, and the
entry performs no CDN fetches. `loadSiteInfoAliases` fetches only when an
application explicitly calls that helper.

During module initialization, the adapter captures the upstream UMD parser and
its bundled configuration once, then restores any pre-existing global `Parser`
property (or removes the temporary property). Formatter calls retain only that
captured internal parser and do not consult the global again.

## Formatter functions

| Function | Return | Structured failure | Rule diagnostics | Additional idempotency pass |
| --- | --- | --- | --- | --- |
| `formatWikitext` | `string` | Hidden; failed candidates return original string | No | No |
| `formatWikitextResult` | `FormatResult` | Yes | No | No |
| `formatWikitextDetailedResult` | `FormatDetailedResult` | Yes | Yes | No |
| `formatWikitextSafe` | `FormatResult` | Yes | No | Yes |
| `formatWikitextSafeDetailed` | `FormatDetailedResult` | Yes | Yes | Yes |

“No additional idempotency pass” does not mean no verification. All five enter
the same base formatter pipeline, which classifies line endings, parses and
round-trips input, performs rule-specific convergence and equivalence checks,
reparses output, verifies final document structure, and fails closed. Pure CRLF
input is formatted through an internal LF snapshot and restored to CRLF before
returning. The safe variants run the complete external-input pipeline a second
time and require the restored second output to equal the first exactly.

### Compact string API

```ts
import { formatWikitext } from "wikitext-fmt";

const formatted = formatWikitext(source, { profile: "default" });
```

This is convenient when original-on-failure behavior is sufficient. It cannot
distinguish “already canonical” from “candidate rejected”; use a result API
when that distinction matters.

### Failures without detailed rule data

```ts
import { formatWikitextResult } from "wikitext-fmt";

const result = formatWikitextResult(source);
if (result.failure) {
  console.error(result.failure.code, result.failure.stage);
}
```

### Detailed diagnostics

```ts
import { formatWikitextDetailedResult } from "wikitext-fmt";

const result = formatWikitextDetailedResult(source);
console.log(
  result.tableDiagnostics,
  result.listDiagnostics,
  result.templateDiagnostics,
);
```

### Idempotency-checking API

```ts
import { formatWikitextSafeDetailed } from "wikitext-fmt";

const result = formatWikitextSafeDetailed(source, {
  profile: "production",
});
```

Safe results return the original source if the first call fails, warns, or the
second call changes output.

## Core result types

`FormatResult` contains:

```ts
interface FormatResult {
  formatted: string;
  failure?: FormatFailure;
  warning?: string;
}
```

`warning` is compatibility text derived from a structured failure. New code
should branch on `failure` and its stable code rather than parse warning text.

`FormatDetailedResult` adds:

- `tableDiagnostics` and aggregate `tableFormatDiagnostics`;
- `footerDiagnostics`;
- redirect, file-link, wikilink, external-link, reference, and section-spacing
  diagnostics;
- parser-confirmed list-prefix diagnostics;
- unified template diagnostics in `templateDiagnostics`;
- structural-equivalence diagnostics.

`footerDiagnostics` includes inspected, eligible, skipped, moved, and formatted
interlanguage-link counters plus `interlanguageLinkSkipReasons`. The exported
`InterlanguageLinkSkipReason` union covers parser confirmation, root and
whole-line eligibility, labelled or leading-colon links, generic or
unconfigured prefixes, unstable targets, and unsafe parents.

The package exports `FormatResult`, `FormatDetailedResult`, `FormatFailure`,
`FormatFailureCode`, `DiagnosticsSummary`, `TemplateDiagnostics`, and the
public per-rule diagnostic types.

`WikilinkDiagnostics` distinguishes inspected and eligible parser nodes,
formatted links, replaced underscores, fragment-containing changes, unsafe
skips, and their reason histogram. Only the page-title component is normalized;
labels and fragments are not counted as replacements.

`ListDiagnostics` distinguishes inspected, eligible, changed, already-canonical,
and conservatively skipped list lines. The `listLinesSkipped` counter includes
every skip reason, not only ambiguity.
`listLinesEligible` includes changed and already-canonical lines, so the
following invariants hold:

```text
listLinesEligible = listLinesChanged + listLinesAlreadyCanonical
listLinesInspected = listLinesEligible + listLinesSkipped
```

The diagnostics separately count changed mixed-marker lines, comment-bearing
lines, and lines with parser-confirmed structured content. Their `skipReasons`
histogram uses `ListSkipReason` values such as `not-parser-confirmed`,
`unicode-separator`, `multiline-content`, `unclosed-comment`, `ignore-range`,
`protected-block`, `structure-changed`, and `candidate-not-roundtrip-safe`.
These skips are ordinary rule decisions, not formatter failures.

## Options and profiles

The package exports:

- `FormatOptions`;
- `FormatProfile` and `FormatLevel`;
- `HtmlVoidTagStyle`, `TableCellSeparatorStyle`, `InlineTemplateSpacing`,
  `TemplateParameterLayout`, `BehaviorSwitchPlacement`, and
  `InterlanguagePlacement`;
- `LocalizationSource`, `LocalizedSyntaxStyle`, and `LocalizationAliases`;
- read-only `defaultOptions`.

`ResolvedFormatOptions` and `resolveOptions` are internal. See
[Configuration](configuration.md) for the complete option contract.

`inlineTemplateSpacing` accepts `auto`, `compact`, or `spaced` and defaults to
`auto`. It controls only single-line named and explicitly numbered templates;
`templateParameterLayout` independently controls multiline rendering.
Anonymous values remain byte-preserved, and mixed templates do not receive the
spaced inline form. Both styles change only parser-confirmed ASCII syntax
layout; non-ASCII whitespace in template names, keys, and values is preserved.
Independently of those layout choices, the enabled template engine renders
ASCII underscores in stable parser-confirmed ordinary invocation titles as
ASCII spaces. Thus `{{a_b_c|x=1}}` uses the title `a b c` while retaining the
selected parameter layout. Parser functions, magic words, triple-brace
parameters, dynamic names, parameter keys, and parameter values are not title
normalization targets.

## Rule metadata

`ruleLevels` is a read-only mapping from each `RuleName` to `safe`, `normal`, or
`experimental`:

```ts
import { ruleLevels } from "wikitext-fmt";

console.log(ruleLevels.tables); // "normal"
```

The `experimental` ceiling remains part of the public option contract for future
rules, but no current rule is classified at that level. The package does not
export the internal `isRuleEnabled` helper.

## Structural equivalence

```ts
import { verifyStructuralEquivalence } from "wikitext-fmt";
import type { Config } from "wikiparser-node";

declare const parserConfig: Config; // obtained through wikiparser-node
const result = verifyStructuralEquivalence(
  before,
  after,
  parserConfig,
  "templates",
);
```

Public types are `StructuralEquivalenceKind` (`templates`, `tables`, or
`document`) and `StructuralEquivalenceResult`. Document comparison also
requires resolved format options as its optional fifth argument so
localization-aware canonicalization can be applied. The parser `Config` is a
`wikiparser-node` boundary type; this package does not export its internal
parser-config loader. Standalone equivalence normalizes each pure CRLF input to
an LF snapshot before fingerprinting. Mixed LF/CRLF or bare CR returns
`equivalent: false`.

Document fingerprints compare templates, tables, ordinary and file links,
external links, references, categories, defaultsort, redirects, headings,
behavior switches, interlanguage links, extension and HTML nodes, comments, and
ordinary prose. When `formatWikilinks` is enabled, underscore/space equivalence
is narrowed to eligible parser-confirmed page-title components; labels,
fragments, category sort keys, file options, and remote targets remain strict.
Template fingerprints use the parser's semantic ordinary invocation title, so
ASCII underscore and space spellings compare equally there while dynamic
titles, magic words, parser-function arguments, and all parameter content
remain strict.
`equivalent: false` includes a category-specific reason.

## Localization

The package exports:

- `loadSiteInfoAliases(apiUrl, fetch?)`;
- `normalizeSiteInfoPayload(payload)`;
- `loadSiteInfoFormattingData(apiUrl, fetch?)`;
- `normalizeSiteInfoFormattingPayload(payload, source?)`;
- `ResolvedLocalizationAliases` and `SiteInfoFormattingData` as types.

The compatibility helpers return aliases only. The formatting-data helpers also
return interlanguage prefixes derived from language-marked `interwikimap`
entries. The formatter itself never fetches siteinfo. Load and pass the data;
selecting `siteinfo` without loaded aliases fails closed. See
[Localization](localization.md).

## Configuration helpers

Public config exports are:

- `CONFIG_FILENAMES`;
- `discoverConfig(startDirectory?)`;
- `loadConfig(path)`;
- `validateConfig(value)`;
- `loadProjectConfig(path)`;
- `validateProjectConfig(value)`.

These helpers perform filesystem discovery or validation only when the caller
invokes them. Formatter functions do not call them.

`loadConfig` and `validateConfig` remain compatible names and accept the
extended `ProjectConfig` shape. Relative top-level/site parser paths and site
snapshot/cache paths are resolved by `loadProjectConfig` from the config file
directory.

## Unified project/site resolver

The Node entry additionally exports:

- `resolveProjectConfiguration(options?)`;
- `loadSiteConfigurationSnapshot(path, options?)`;
- `clearSiteConfigurationMemoryCache()`;
- `ResolvedProjectConfiguration`, `ResolveProjectConfigurationOptions`, and
  `SiteConfigurationStorage` types.

```ts
import {
  formatWikitextSafe,
  loadProjectConfig,
  resolveProjectConfiguration,
} from "wikitext-fmt";

const projectConfig = await loadProjectConfig(".wikitextfmtrc");
const resolved = await resolveProjectConfiguration({ projectConfig });
const result = formatWikitextSafe(source, resolved.options);

console.log(resolved.siteConfiguration.source); // snapshot, fresh-cache, ...
```

The resolver owns Node filesystem access, parser `ConfigData` validation,
siteinfo fetching, per-process cache and same-API request deduplication, TTL and
stale-cache decisions, atomic writes, source reporting, and local-namespace
conflict filtering. `formatterOverrides` and `siteOverrides` represent explicit
CLI/editor values and take priority over the project config. Callers can inject
`fetchImplementation`, `storage`, `now`, network/cache permissions, and a
default cache directory for deterministic tests or host policy.

`ResolvedSiteConfiguration.source` is `none`, `snapshot`, `fresh-cache`,
`network`, or `stale-cache`; it also reports sanitized API and parser sources,
resolved paths, `fetchedAt`, stale state, whether aliases/prefixes were applied,
excluded namespace-conflicting prefixes, and diagnostics.

The browser entry exports only the pure project/snapshot validation,
normalization, serialization, sanitization, and apply helpers. It deliberately
does not export config discovery/loading, snapshot file loading, or the unified
Node resolver, so its dependency graph remains free of Node built-ins.

## Explicit parser-config generation (Node only)

The Node entry exports `generateSiteParserConfig`,
`validateGeneratedParserConfig`, `serializeGeneratedParserConfig`,
`compareParserConfigs`, and `writeGeneratedParserConfig`. The generator accepts
an API URL, optional CodeMirror script path, bounded fetch/execute settings, and
injectable `fetchImplementation` and `ParserConfigModuleExecutor` values for
offline tests. It returns pure `ConfigData`, diagnostics, and a separate
`ParserConfigProvenance` record. `writeGeneratedParserConfig` writes ConfigData
and `<outputPath>.meta.json` atomically only when explicitly called.

This API is intentionally absent from `wikitext-fmt/browser`. Formatter calls do
not import it, fetch, run a child process, or execute remote JavaScript.

## Parser-function policy

`classifyParserFunction`, `ParserFunctionFormattingClass`, and
`ParserFunctionPolicy` expose the policy used to distinguish opaque,
unsupported, and explicitly safe parser-function formatting classes. Parser
nodes and parser contexts themselves are not public.

## Failure codes

All `FormatFailureCode` values and their stages are documented in
[Safety and diagnostics](safety-and-diagnostics.md).

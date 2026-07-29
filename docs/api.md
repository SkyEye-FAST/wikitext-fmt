# JavaScript API

Only exports from the package root are public:

```ts
import { formatWikitextSafe } from "wikitext-fmt";
```

Files under `src/`, including parser contexts and `resolveOptions`, are
implementation details even if a source checkout makes them importable.

All public surfaces remain subject to the
[pre-1.0 compatibility policy](versioning.md).

## Formatter functions

| Function | Return | Structured failure | Rule diagnostics | Additional idempotency pass |
| --- | --- | --- | --- | --- |
| `formatWikitext` | `string` | Hidden; failed candidates return original string | No | No |
| `formatWikitextResult` | `FormatResult` | Yes | No | No |
| `formatWikitextDetailedResult` | `FormatDetailedResult` | Yes | Yes | No |
| `formatWikitextSafe` | `FormatResult` | Yes | No | Yes |
| `formatWikitextSafeDetailed` | `FormatDetailedResult` | Yes | Yes | Yes |

“No additional idempotency pass” does not mean no verification. All five enter
the same base formatter pipeline, which parses and round-trips input, performs
rule-specific convergence and equivalence checks, reparses output, verifies
final document structure, and fails closed. The safe variants run that pipeline
a second time and require the second output to equal the first exactly.

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
console.log(result.tableDiagnostics, result.templateParameterDiagnostics);
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
- redirect, file-link, external-link, reference, and section-spacing
  diagnostics;
- template and template-parameter diagnostics;
- structural-equivalence diagnostics.

The package exports `FormatResult`, `FormatDetailedResult`, `FormatFailure`,
`FormatFailureCode`, `DiagnosticsSummary`, and the public per-rule diagnostic
types.

## Options and profiles

The package exports:

- `FormatOptions`;
- `FormatProfile` and `FormatLevel`;
- `HtmlVoidTagStyle`, `TableCellSeparatorStyle`, `TemplateParameterLayout`,
  `BehaviorSwitchPlacement`, and `InterlanguagePlacement`;
- `LocalizationSource`, `LocalizedSyntaxStyle`, and `LocalizationAliases`;
- read-only `defaultOptions`.

`ResolvedFormatOptions` and `resolveOptions` are internal. See
[Configuration](configuration.md) for the complete option contract.

## Rule metadata

`ruleLevels` is a read-only mapping from each `RuleName` to `safe`, `normal`, or
`experimental`:

```ts
import { ruleLevels } from "wikitext-fmt";

console.log(ruleLevels.tables); // "normal"
```

The package does not export the internal `isRuleEnabled` helper.

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
parser-config loader.

Document fingerprints compare templates, tables, ordinary and file links,
external links, references, categories, defaultsort, redirects, headings,
behavior switches, interlanguage links, extension and HTML nodes, comments, and
ordinary prose. `equivalent: false` includes a category-specific reason.

## Localization

The package exports:

- `loadSiteInfoAliases(apiUrl, fetch?)`;
- `normalizeSiteInfoPayload(payload)`;
- `ResolvedLocalizationAliases` as a type.

The formatter itself never fetches siteinfo. Load aliases and pass them as
`localizationAliases`; selecting `siteinfo` without loaded aliases fails
closed. See [Localization](localization.md).

## Configuration helpers

Public config exports are:

- `CONFIG_FILENAMES`;
- `discoverConfig(startDirectory?)`;
- `loadConfig(path)`;
- `validateConfig(value)`.

These helpers perform filesystem discovery or validation only when the caller
invokes them. Formatter functions do not call them.

## Parser-function policy

`classifyParserFunction`, `ParserFunctionFormattingClass`, and
`ParserFunctionPolicy` expose the policy used to distinguish opaque,
unsupported, and explicitly safe parser-function formatting classes. Parser
nodes and parser contexts themselves are not public.

## Failure codes

All `FormatFailureCode` values and their stages are documented in
[Safety and diagnostics](safety-and-diagnostics.md).

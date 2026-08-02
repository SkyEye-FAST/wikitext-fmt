# wikitext-fmt

[![Checks](https://github.com/SkyEye-FAST/wikitext-fmt/actions/workflows/checks.yml/badge.svg)](https://github.com/SkyEye-FAST/wikitext-fmt/actions/workflows/checks.yml)
[![npm version](https://img.shields.io/npm/v/wikitext-fmt)](https://www.npmjs.com/package/wikitext-fmt)
[![npm downloads](https://img.shields.io/npm/dm/wikitext-fmt)](https://www.npmjs.com/package/wikitext-fmt)
[![Visual Studio Marketplace](https://vsmarketplacebadges.dev/version/skyeyefast.wikitext-formatter.svg)](https://marketplace.visualstudio.com/items?itemName=skyeyefast.wikitext-formatter)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](LICENSE)

`wikitext-fmt` is a parser-assisted, semantics-preserving formatter for
MediaWiki wikitext. It is a standalone npm package and CLI, not a MediaWiki
extension, and it does not require a running wiki for ordinary formatting.

## Project status

The project is pre-1.0. Published core releases are available through npm. The
VS Code extension is also released and is versioned independently from the core
package. Component tags use `core-v<version>` for the npm package and
`vscode-v<version>` for the extension.

Repository package metadata alone does not prove that a version has been
published. See the [versioning policy](docs/versioning.md) for the pre-1.0
compatibility rules and the distinction between development metadata, release
preparation, component tags, and verified publication.

The CLI, JavaScript and browser APIs, VS Code extension, configuration
validation, and fail-closed formatter pipeline are tested for interactive use
and automation. The `production` profile enables all mature normal rules and
adds an idempotency pass. Before 1.0, defaults, rule eligibility, configuration,
diagnostics, and public types may still change in an explicitly documented
pre-1.0 release.

## Core principles

- Formatting must not reorder template parameters, table rows or cells,
  categories, links, attributes, titles, or ordinary text.
- User values and prose are never translated. Only certainly recognized syntax
  aliases may be canonicalized when explicitly requested.
- Rules preserve structures they do not understand and do not guess across
  ambiguous parser boundaries.
- The base formatter pipeline parses and round-trips input, verifies
  rule-specific structure, reparses output, and checks final document
  equivalence before accepting a candidate.
- Any failed safeguard returns the original source with structured failure
  information. Safe APIs and safe CLI mode add a second formatting pass to
  verify idempotency.

Template formatting has one unified template rule. For originally single-line
named and explicitly numbered templates, `inlineTemplateSpacing` first produces
a parser-safe candidate. Parameter count alone does not expand it: candidates
at or below `lineWidth` stay inline, while `templateParameterLayout` formats
templates that were already multiline or whose safe candidate exceeds the
width. Anonymous parameters keep their separate byte-preserving policy.

For exact boundaries, see
[Safety and diagnostics](docs/safety-and-diagnostics.md) and
[Formatting rules](docs/rules.md).

## Installation

The CLI and Node.js entry support Node.js 22.13+ on the 22.x line, or Node.js
24.11+. The browser entry executes in modern browsers and Web Workers without a
Node.js runtime. Package installation and frontend bundling still use a build
environment subject to package metadata; use those supported Node versions.

Install the CLI globally:

```sh
npm install --global wikitext-fmt
```

Or install the package in an application:

```sh
npm install wikitext-fmt
```

Repository development uses the pnpm version pinned in `package.json`:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

See [Getting started](docs/getting-started.md) for first-use and development
setup.

## CLI quick start

Preview formatted output:

```sh
wikitext-fmt page.wiki
```

Check, diff, or write:

```sh
wikitext-fmt --check page.wiki
wikitext-fmt --diff page.wiki
wikitext-fmt --write page.wiki
```

Read stdin or inspect the installed version:

```sh
cat page.wiki | wikitext-fmt --stdin
wikitext-fmt --version
```

Use `wikitext-fmt --help` for structured option help and
[the CLI reference](docs/cli.md) for modes, conflicts, streams, reports,
siteinfo, and exit statuses.

## JavaScript API quick start

```ts
import { formatWikitextSafe } from "wikitext-fmt";

const result = formatWikitextSafe("==Title==\n");
if (result.failure) {
  console.error(result.failure.code, result.warning);
} else {
  console.log(result.formatted);
}
```

The package also exposes compact string output, detailed rule diagnostics,
structural-equivalence helpers, localization helpers, and config loading.
See the [API reference](docs/api.md).

### Browser API

```ts
import { formatWikitextSafe } from "wikitext-fmt/browser";

const result = formatWikitextSafe("==Title==\n");

if (result.failure) {
  console.error(result.failure);
} else {
  console.log(result.formatted);
}
```

Browser formatting runs entirely locally and uses the same fail-closed parsing,
round-trip, structural-equivalence, convergence, and idempotency pipeline as the
Node.js entry. The initial browser entry supports only the bundled `mediawiki`
or `default` parser configuration. Filesystem paths and arbitrary named parser
configurations are Node-only and fail closed in browser result APIs. No parser
assets are fetched from a CDN at runtime.

## Profiles

Profiles are presets; reliability levels are cumulative rule ceilings.
Explicit options override profile values.

| Profile | Purpose |
| --- | --- |
| `default` | Standard options for interactive use |
| `production` | All mature, verifiable normal rules for automation, including parser-confirmed interlanguage-footer placement; CLI adds the idempotency-checking pass |

The pre-1.0 `aggressive` profile has been removed. The `experimental`
reliability ceiling remains available for future rules, although no current
rule uses it.

Use `--fail-on-warning` in automation when a fail-closed fallback should fail
the command. Profiles, levels, and every option are documented in
[Configuration](docs/configuration.md).

## VS Code extension

The separately versioned
[`wikitext-formatter`](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/packages/vscode/README.md)
extension provides Format
Document and format-on-save support for `.wiki`, `.wikitext`, and `.mediawiki`
files. Its VSIX bundles the core formatter and parser assets, so installed
extensions do not depend on a workspace checkout.

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/getting-started.md)
- [CLI reference](docs/cli.md)
- [Configuration reference](docs/configuration.md)
- [JavaScript and browser API](docs/api.md)
- [Safety and diagnostics](docs/safety-and-diagnostics.md)
- [Formatting rules](docs/rules.md)
- [Localization](docs/localization.md)
- [Corpus and benchmarks](docs/corpus-and-benchmarks.md)
- [Development](docs/development.md)
- [Versioning policy](docs/versioning.md)
- [Release guide](docs/releasing.md)

## Contributing and support

Development workflows and verification commands are in
[docs/development.md](docs/development.md). Coding agents must also follow
[AGENTS.md](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/AGENTS.md).

Report bugs or request features through
[GitHub Issues](https://github.com/SkyEye-FAST/wikitext-fmt/issues). Pull
requests are welcome.

## License

Licensed under [GPL-3.0-or-later](LICENSE).

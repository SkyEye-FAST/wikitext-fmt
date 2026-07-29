# wikitext-fmt

`wikitext-fmt` is a conservative, parser-assisted structural formatter for
MediaWiki wikitext. It is a standalone npm package and CLI, not a MediaWiki
extension, and it does not require a running wiki for ordinary formatting.

## Project status

The project is pre-1.0. The current package development version is `0.2.0`;
that number in the repository does not by itself mean the version has been
published. There are currently no component release tags in this repository.
See the [versioning policy](docs/versioning.md) for the distinction between a
development version, an `Unreleased` changelog, release preparation, tagging,
and publication.

The documented CLI streams, configuration validation, public entry points, and
fail-closed formatter pipeline are tested and usable for controlled automation.
Before 1.0, defaults, rule eligibility, configuration, diagnostics, and public
types may still change in an explicitly documented pre-1.0 release.

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

For exact boundaries, see
[Safety and diagnostics](docs/safety-and-diagnostics.md) and
[Formatting rules](docs/rules.md).

## Installation

Supported runtimes are Node.js 22.13+ on the 22.x line, or Node.js 24.11+.

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

## Profiles

Profiles are presets; reliability levels are cumulative rule ceilings.
Explicit options override profile values.

| Profile | Purpose |
| --- | --- |
| `default` | Normal-level defaults for interactive use |
| `production` | Coordinated normal-level structural rules; CLI uses the idempotency-checking path by default |
| `aggressive` | Production rules plus selected experimental formatting; CLI also uses the idempotency-checking path by default |

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
- [JavaScript API](docs/api.md)
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

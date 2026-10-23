# Development

## Repository layout

- `src/formatterEngine.ts`: shared formatter pipeline and fail-closed
  orchestration. Each public call resolves options and creates one immutable
  parser session; safe formatting reuses that session for both passes.
  `src/formatter.ts` and `src/browser.ts` are thin runtime entries.
- `src/options.ts` and `src/options/schema.ts`: options, defaults, profiles, and
  runtime metadata.
- `src/parserRuntime.ts`, `src/parser.node.ts`, `src/parser.browser.ts`, and
  `src/parserContext.ts`: immutable parser sessions, runtime-specific config
  resolution, and source-snapshot contexts. Contexts retain their session, so
  reparsing and equivalence checks cannot mix runtimes or configurations.
  `src/equivalenceEngine.ts` contains shared structural verification;
  `src/equivalence.ts` is the Node-facing wrapper.
- `src/public.ts`: browser-safe public types, formatter metadata, localization
  helpers, and diagnostics shared by the Node and browser entries.
- `src/projectConfig.ts`: browser-safe `ProjectConfig`/site/snapshot contracts,
  strict validation, deterministic serialization, and pure site-data apply
  logic. It must not import Node built-ins.
- `src/config.ts` and `src/siteConfiguration.ts`: Node-only discovery/path
  resolution plus unified snapshot/cache/network/parser resolution. The CLI and
  VS Code wrapper must share this resolver instead of implementing their own
  precedence or siteinfo-fetch flows.
- `src/rules/`: transformations and rule diagnostics.
- `src/cli.ts` and `src/cli/`: CLI parsing, config, paths, streams, diagnostics,
  reports, and siteinfo.
- `src/localization/`: alias resolution and siteinfo normalization.
- `tests/`: focused, integration, CLI, fixture, and regression tests.
- `tests/real-pages/`: committed production corpus.
- `scripts/`: docs/version checks, corpus, benchmark, localization, package,
  and release tooling.
- `packages/vscode/`: thin VS Code wrapper.

Coding agents also read
[AGENTS.md](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/AGENTS.md).

## Toolchain

Use Node.js `^22.13.0` or `>=24.11.0` and the pinned pnpm release:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Use pnpm for dependency changes; it regenerates `pnpm-lock.yaml`.

## Focused verification

```sh
pnpm build
pnpm typecheck
pnpm typecheck:tests
pnpm exec vitest run tests/<relevant-file>.test.ts
pnpm check:browser
```

Run the focused tests for the files you changed. The full gate, needed when
the formatting pipeline or rule output changes and before a release, is:

```sh
pnpm check
pnpm corpus
```

`pnpm check` builds all packages, validates version and documentation metadata,
type-checks, bundles the browser entry for `platform=browser`, runs tests, checks
extension and core package contents, and executes smoke tests.

## Browser entry

The root build emits `dist/browser.js` and `dist/browser.d.ts`. Frontends depend
on the published package and import only from `wikitext-fmt/browser`; Worker
code can call the formatter synchronously inside `onmessage`. The entry ships
the parser runtime in its dependency graph and downloads nothing at runtime.

When a change touches what the browser entry imports, run:

```sh
pnpm exec vitest run tests/browser-entry.test.ts
pnpm check:browser
```

`check:browser` bundles the workspace entry and the packed npm artifact for
`platform=browser`, rejects Node, CLI, config-discovery, VS Code, and `fast-glob`
inputs, runs the bundle in a Worker harness without Node globals, and reports
its raw and gzip size.

## Documentation checks

```sh
pnpm check:docs
pnpm check:versions
```

`check:docs` builds runtime metadata, validates relative Markdown links, checks
that option/rule/editor metadata appears in its reference document, rejects
stale moved-file references, and checks npm documentation inclusion.

`check:versions` is a normal development check and does not claim that the
current package version is published. Release finalization uses:

```sh
pnpm check:release-metadata
```

## Corpus and benchmark checks

```sh
pnpm corpus
pnpm benchmark
pnpm benchmark:release
```

See [Corpus and benchmarks](corpus-and-benchmarks.md) before adding a fixture,
changing a baseline, or interpreting machine-sensitive metrics.

## VS Code extension

```sh
pnpm --filter wikitext-formatter typecheck
pnpm --filter wikitext-formatter test
pnpm check:extension
pnpm check:vsix
pnpm check:vscode-release
```

Keep the wrapper thin: formatter semantics and reusable diagnostics belong in
the core.

## Adding or changing a rule

1. Put the transformation and diagnostics in `src/rules/`.
2. Add its name and reliability level in `src/rules/index.ts`.
3. Add/gate the corresponding option in the option schema and resolved
   defaults.
4. Decide which syntax is parser-understood and which ranges must be protected.
5. Make canonical input a no-op and preserve source outside scope.
6. Add focused tests for the change, a canonical no-op, and the fallback cases
   the rule is designed to skip.
7. Update [Formatting rules](rules.md), [Configuration](configuration.md), and
   the appropriate changelog.

Fix the rule rather than weakening round-trip, equivalence, or idempotency
checks.

## Adding or changing an option

Keep these surfaces synchronized:

- `FormatOptions`, `ResolvedFormatOptions`, `defaultOptions`, and profile
  resolution;
- `optionSchema` validation and runtime metadata;
- CLI argument parsing/help where exposed;
- config validation and precedence;
- root package exports where public;
- VS Code setting/mapping/tests when editor-visible;
- configuration, CLI, API, and rule documentation;
- changelog/report schema where behavior is observable.

`pnpm check:docs` verifies presence, not explanatory accuracy; review prose
against implementation.

## Localization updates

```sh
pnpm localization:update /path/to/mediawiki/languages/messages
```

Review generated aliases and provenance. Update focused localization tests and
[Localization](localization.md) when source languages, alias families, merging,
or canonicalization behavior changes.

## Project and site configuration changes

Keep these boundaries explicit:

- synchronous `formatWikitext*` calls accept pure `FormatOptions` and perform no
  filesystem/network work;
- project/snapshot normalization and serialization remain browser-safe;
- Node loading resolves every relative project path from the config directory;
- CLI/editor explicit values retain precedence over top-level project values,
  then `site`, site data, profiles, and defaults;
- cache files are schema/version/API checked and written atomically;
- stale cache is never used unless configured and a network refresh failed;
- same-API requests are deduplicated, including VS Code format/check/preview;
- untrusted VS Code workspaces may use snapshots but not network or persistent
  cache;
- siteinfo supplies only formatter data, never a generated parser config.

Tests live in `tests/site-configuration.test.ts`, the config and CLI tests, and
`packages/vscode/tests/format.test.ts`. Run `pnpm check:browser` when a change
could pull the Node resolver into the browser entry.

## Diagnostics changes

When adding counters or failure information:

- update the rule diagnostic type;
- map it through detailed formatter results;
- update CLI `DiagnosticsSummary`, serialization, and batch aggregation;
- keep stdout/stderr separation;
- add a test at the level that changed;
- update [Safety and diagnostics](safety-and-diagnostics.md);
- record user-visible schema changes in the changelog.

The report schema remains pre-1.0.

## Generated files

Do not edit or commit normal build products (`dist`, `dist-test`), VSIX files,
downloaded VS Code, corpus reports, current benchmark reports, logs, coverage,
or dependencies. Generated localization data and the versioned benchmark
baseline are committed only through their explicit reviewed workflows.

## Changelogs and release work

Every user-visible core/CLI change belongs in root `CHANGELOG.md`; every
extension-visible change belongs in `packages/vscode/CHANGELOG.md`. Keep
development work under `Unreleased`. Use [Versioning](versioning.md) to select
versions and [Releasing](releasing.md) only when preparing artifacts.

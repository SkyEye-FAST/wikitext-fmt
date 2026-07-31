# AGENTS.md

This file applies to the entire repository unless a more specific `AGENTS.md` is added in a subdirectory.

## Project purpose

`wikitext-fmt` is a parser-assisted structural formatter for MediaWiki wikitext. The project is intentionally conservative: formatting must not change page semantics, reorder content, translate values, or guess when parser boundaries are ambiguous.

The formatter should fail closed. When parsing, exact round-tripping, structural equivalence, convergence, or idempotency cannot be demonstrated, return the original source and expose a structured diagnostic instead of emitting a risky partial rewrite.

## Repository layout

- `src/formatterEngine.ts` orchestrates rule execution, protected regions, diagnostics, equivalence checks, and safe fallback behavior; `src/formatter.ts` binds the Node runtime.
- `src/options.ts` defines public options, resolved options, defaults, and profile overrides.
- `src/parserRuntime.ts`, `src/parser.ts`, and `src/parserContext.ts` contain parser sessions, runtime integration, and source-range helpers.
- `src/rules/` contains individual formatting rules and their diagnostics.
- `src/rules/index.ts` defines rule names and reliability levels.
- `src/equivalenceEngine.ts` verifies semantic structure before accepting formatter output; `src/equivalence.ts` is the Node-facing public wrapper.
- `src/cli.ts` and `src/cli/` implement command-line behavior, output channels, reports, and exit handling.
- `src/config.ts` handles configuration discovery, loading, and validation.
- `src/localization/` handles built-in, custom, and MediaWiki siteinfo aliases.
- `src/utils/protectBlocks.ts` protects syntax that rules must not inspect or rewrite directly.
- `tests/` contains Vitest unit, integration, CLI, fixture, and regression tests.
- `tests/real-pages/` is the committed production corpus.
- `scripts/` contains corpus, benchmark, localization, package, and release tooling.
- `packages/vscode/` is a thin VS Code wrapper around the core package.
- `docs/` contains the CLI, API, configuration, safety, rule, localization, development, versioning, and release guides.

## Toolchain

Use the versions declared by the repository:

- Node.js `^22.13.0` or `>=24.11.0`
- pnpm through Corepack; the exact pnpm version is pinned in `package.json`

Set up a checkout with:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Do not use npm or Yarn, and do not edit `pnpm-lock.yaml` manually. Regenerate it with pnpm only when dependency metadata actually changes.

## Common commands

Use focused checks while developing, then run the repository-level validation appropriate to the change.

```sh
pnpm build                 # compile the core package
pnpm typecheck             # type-check core sources
pnpm typecheck:tests       # type-check test sources
pnpm exec vitest run tests/<file>.test.ts
pnpm test:run              # run the full Vitest suite once
pnpm check                 # build all packages, type-check, test, and run smoke checks
pnpm corpus                # run committed real-page corpus gates
```

For changes under `packages/vscode/`, also use the relevant commands:

```sh
pnpm --filter wikitext-formatter typecheck
pnpm --filter wikitext-formatter test
pnpm check:extension
pnpm check:vsix
pnpm check:vscode-release
```

The `Checks` workflow runs `pnpm check` on Node.js 22 and 24, runs the
deterministic corpus gate once on Node.js 24, and separately exercises VS Code
extension and VSIX package checks on Node.js 24. The `Core release` workflow is
tag-only for publication; manual dispatch is verification-only.

## TypeScript conventions

- The repository uses ESM with `NodeNext` module resolution. Relative TypeScript imports must use the emitted `.js` suffix.
- Keep code compatible with strict TypeScript and `noUncheckedIndexedAccess`.
- Prefer explicit domain types, discriminated unions, and narrow interfaces over `any` or broad casts.
- Treat parser objects as untrusted boundary values. Narrow them through local types and helper functions before use.
- Keep public exports centralized through `src/index.ts` unless an API is intentionally internal.
- Do not edit generated `dist/` or `dist-test/` output. Build artifacts are produced by scripts.
- Match the existing formatting style: two-space indentation, double quotes, trailing commas in multiline constructs, and small named helpers for nontrivial predicates.

## Formatter safety invariants

These requirements take precedence over making output more aggressive or visually uniform.

1. Preserve MediaWiki semantics. Never reorder template parameters, table rows or cells, categories, links, attributes, titles, or ordinary text.
2. Do not translate user content. Canonicalize only syntax explicitly covered by an option such as `localizedSyntaxStyle`, and only after an alias match is certain.
3. Prefer parser-confirmed source ranges for structural syntax. Conservative line-level checks may supplement parser information, but must not replace it for ambiguous nested structures.
4. Protect extension blocks, HTML, comments, refs, tables, templates, links, and other opaque regions whenever a rule is not designed to understand them.
5. Preserve the original source when a candidate cannot be parsed or verified exactly.
6. Formatting must converge and be idempotent. A second formatting pass must not change accepted output.
7. Safe-mode failures must retain structured `FormatFailure` information and return the original input.
8. Keep stdout clean for formatted text or diffs. Diagnostics belong on stderr or in the requested JSON report.

Do not weaken round-trip, equivalence, convergence, or idempotency checks merely to make a new fixture pass. Fix the transformation, narrow its eligibility, or add a precise fail-closed diagnostic.

## Adding or changing a rule

When implementing a rule:

- Put the transformation and its rule-specific diagnostics in `src/rules/`.
- Assign or update its reliability level in `src/rules/index.ts`.
- Gate it through `isRuleEnabled()` and the corresponding resolved option.
- Decide explicitly which syntax must be protected before the rule runs.
- Make the rule a no-op on already canonical input.
- Avoid global regular-expression rewrites over unprotected wikitext.
- Preserve source spelling and whitespace outside the rule's documented scope.
- Return enough diagnostics to explain skips, changes, ambiguity, or bounded-pass convergence failures.
- Add focused tests for the rule before adding broad integration fixtures.

A rule that changes templates, tables, or other parser-visible structures must participate in the applicable structural equivalence checks. Changes to the overall document pipeline must continue to pass final document equivalence and idempotency verification.

## Options, CLI, and configuration changes

A formatter option often has several synchronized surfaces. When adding or changing one, inspect all of the following:

- `FormatOptions`, `ResolvedFormatOptions`, `defaultOptions`, and `resolveOptions()` in `src/options.ts`
- profile behavior for `default`, `production`, and `aggressive`
- CLI argument parsing, help text, incompatibility checks, and defaults
- JSON config validation and unknown-key rejection
- public exports in `src/index.ts`
- diagnostics and report schemas when the option changes observable behavior
- README CLI, API, configuration, profile, and reliability documentation
- VS Code configuration and mapping when the option should be user-configurable there

Explicit CLI values must retain precedence over explicit config files, discovered config files, profiles, and defaults. The formatter core must not read the filesystem or fetch siteinfo; those are CLI or wrapper responsibilities.

Preserve established CLI behavior:

- `--check` emits no formatted text and exits nonzero when changes are required.
- `--diff` emits unified diffs without modifying files and cannot be combined with `--write`.
- warnings do not fail by default; `--fail-on-warning` opts into failure.
- formatted text and diffs use stdout; debug and JSON diagnostics use stderr.
- unmatched globs, invalid arguments, invalid config, and unsafe combinations should fail clearly rather than being ignored.

## Testing expectations

Add regression coverage at the narrowest useful level. For formatter changes, normally include:

- canonical input that remains unchanged
- input that should be reformatted
- idempotency of the expected output
- disabled-rule and reliability-level behavior where applicable
- nested or structured input
- protected blocks and opaque syntax
- malformed, ambiguous, or unsupported input that must remain unchanged
- localization aliases when syntax recognition is affected
- safe-mode behavior and diagnostics when verification can fail

Use existing test naming and Vitest style. Import source modules with `.js` suffixes, as the current tests do.

Do not update expected output solely because a broad rewrite changed many fixtures. Review every changed fixture for semantic preservation. Add a real-page corpus fixture only when it represents a meaningful regression or parser edge case that unit fixtures do not capture well.

Before completing a core formatter change, run at minimum:

```sh
pnpm exec vitest run tests/<relevant-file>.test.ts
pnpm check
pnpm corpus
```

For documentation-only changes, tests are generally unnecessary unless commands, package metadata, or generated documentation are affected.

## VS Code extension

Keep `packages/vscode/` thin. Formatting semantics, parsing, safety checks, configuration validation, and reusable diagnostics belong in the core package.

When changing extension-visible behavior:

- keep `package.json` contributions, TypeScript settings mapping, README documentation, and tests synchronized
- preserve workspace config discovery and explicit setting precedence
- remember that untitled documents cannot rely on workspace file discovery
- verify the bundled VSIX contains the parser assets and runtime files required without workspace dependencies
- do not add syntax highlighting or LSP responsibilities to the formatter wrapper unless the project scope explicitly changes

## Documentation and release hygiene

Update user-facing documentation when behavior, defaults, profiles, options, diagnostics, CLI output, package contents, or supported runtimes change. Add an entry to `CHANGELOG.md` for user-visible changes and consult `docs/releasing.md` for release-related work.

Do not commit benchmark or corpus report output unless the repository intentionally tracks that specific baseline. Avoid unrelated refactors, mass reformatting, dependency churn, and generated-file changes in focused patches.

# AGENTS.md

`wikitext-fmt` is a parser-assisted formatter for MediaWiki wikitext. When it
cannot verify that output preserves the page, it returns the original source with
a structured diagnostic instead of a partial rewrite.

Repository layout, commands, and the option/diagnostics checklists are in
[docs/development.md](docs/development.md).

## Toolchain

Node.js `^22.13.0` or `>=24.11.0`; pnpm through Corepack. Do not use npm or Yarn,
and regenerate `pnpm-lock.yaml` with pnpm only when dependencies change.

## Conventions

- ESM with `NodeNext`: relative imports use the `.js` suffix.
- Strict TypeScript with `noUncheckedIndexedAccess`; narrow parser objects
  through local types instead of `any` or broad casts.
- Public exports go through `src/index.ts` (Node) and `src/public.ts`
  (browser-safe). `src/projectConfig.ts` and everything reachable from
  `src/browser.ts` must not import Node built-ins.
- `formatWikitext*` calls do not read files or fetch data; loaders, the CLI,
  and wrappers do.
- Two-space indentation, double quotes, trailing commas.
- Do not edit `dist/` or `dist-test/`.

## Formatter invariants

- Never reorder or translate content. Localized syntax is canonicalized only
  through an explicit option after an exact alias match.
- Rules protect syntax they do not understand and use parser-confirmed ranges
  for structural syntax.
- Output must be idempotent. When verification fails, return the original input
  with a `FormatFailure`; fix the rule rather than weakening the check.
- stdout carries only formatted text or diffs; diagnostics go to stderr or the
  JSON report.

## Verification

Run the tests for the files you touched (`pnpm exec vitest run tests/<file>.test.ts`)
and `pnpm typecheck`. Run `pnpm check` and `pnpm corpus` only when the formatting
pipeline or a rule's output changes. Documentation-only changes need no tests.

Add a test for the behavior you changed; do not add broad fixtures or corpus
pages unless they cover a case unit tests cannot.

Record user-visible changes under `Unreleased` in `CHANGELOG.md`.

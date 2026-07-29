# Release guide

This guide covers the independently versioned `wikitext-fmt` npm package and
`wikitext-formatter` VS Code extension. It describes preparation and manual
publication; ordinary development does not publish or tag anything.

Run from a clean worktree unless a step explicitly inspects release edits.

## 1. Select the release

- Classify API, CLI, config, formatter, package, and extension compatibility
  using [Versioning](versioning.md).
- Choose core and extension versions independently before editing metadata.
- Confirm which components are being released.
- Confirm a bundled core change with editor-visible behavior is reflected in
  the extension version and changelog.

## 2. Runtime and dependency baseline

- Confirm Node.js 22.13+ on the 22.x line and Node.js 24.11+ CI coverage.
- Confirm `engines.node` and VS Code `engines.vscode`.
- Run:

  ```sh
  corepack enable
  pnpm install --frozen-lockfile
  ```

- Review dependency and lockfile changes, especially `wikiparser-node`.
- Regenerate the lockfile with pnpm only when metadata changed.

## 3. Development verification

```sh
pnpm check:docs
pnpm check:versions
pnpm build
pnpm typecheck
pnpm typecheck:tests
pnpm test:run
pnpm check
```

Verify compiled CLI metadata:

```sh
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js -v
```

Both version commands must print only the core version and a newline.

## 4. Corpus and benchmark evidence

```sh
pnpm corpus
pnpm benchmark
pnpm benchmark:release
```

Confirm:

- zero warnings, parse, idempotency, equivalence, or convergence failures;
- required template/table page and node coverage;
- no unexplained skip reasons;
- builder content-model filtering and runner non-wikitext skips;
- manifest parser/localization behavior, including a reviewed `--no-manifest`
  run;
- reasonable p50/p95/p99 and largest-page churn;
- deterministic parser-work assertions;
- reviewed timing/RSS comparison without unexplained regression.

Private medium/full corpora and generated reports remain release artifacts, not
committed repository output.

## 5. Extension and VSIX

For an extension release:

```sh
pnpm --filter wikitext-formatter typecheck
pnpm --filter wikitext-formatter test
pnpm check:extension
pnpm check:vsix
pnpm check:vscode-release
```

Confirm Format Document and format on save in a clean VS Code profile. Verify
safe warning/no-edit behavior and a representative config discovery case.

The VSIX must contain `dist/extension.js`, package metadata, README, changelog,
license, and required parser config assets. It must exclude source, tests,
scripts, TypeScript configs, generated declarations/maps, previous VSIX files,
and repository-only core docs.

## 6. Package contents

Inspect the npm file list:

```sh
pnpm pack --dry-run
```

The package must contain:

- `dist`;
- root `README.md`, `CHANGELOG.md`, and `LICENSE`;
- the complete user/contributor `docs/` hierarchy;
- generated runtime parser/localization JSON.

It must exclude tests, fixtures, reports, extension build output, credentials,
and dependency directories.

Build the VSIX and inspect its independent file list:

```sh
pnpm --filter wikitext-formatter check:package-content
pnpm --filter wikitext-formatter vscode:package
```

## 7. Changelog finalization

For each component being released:

- move selected entries from `Unreleased` to `## VERSION - YYYY-MM-DD`;
- keep only non-empty Keep a Changelog categories;
- mark breaking changes;
- leave `Unreleased` empty;
- remove no unrelated future work;
- do not invent historical dates.

Then run:

```sh
pnpm check:release-metadata              # both components
pnpm check:release-metadata core         # core only
pnpm check:release-metadata vscode       # extension only
```

This check is intentionally expected to fail during ordinary development while
current work remains under `Unreleased`.

## 8. Tag and release names

Use component-specific names derived from the finalized package versions:

```text
core-v0.2.0
vscode-v0.2.0
```

Do not create a shared ambiguous tag. Verify the commit and reviewed artifact
before creating signed or annotated tags. The metadata check prints expected
names but does not create or prove tags.

## 9. npm publication

- Authenticate to the intended registry and verify ownership.
- Pack once, inspect the exact tarball, and retain its checksum.
- Publish that reviewed artifact with the intended dist-tag.
- Verify installation and both CLI version aliases in a clean environment.

Publication is a manual, separately authorized action.

## 10. Marketplace publication

- Install the reviewed VSIX in a clean profile.
- Authenticate the `skyeyefast` publisher.
- Upload that exact VSIX with the extension changelog.
- Verify Marketplace installation, activation, bundled parser assets, and
  formatting without workspace dependencies.

## 11. Post-release verification

- Confirm registry and Marketplace versions independently.
- Confirm component-specific Git tags/releases point to the published commit.
- Record artifact checksums or links.
- Re-open `Unreleased` for subsequent development.
- Check that docs call the version released only after publication/tag evidence
  is available.

## 12. Rollback

Record before publication:

- previous known-good npm/VSIX versions;
- who can deprecate an npm version or remove/replace a Marketplace release;
- whether a fix-forward patch is safer than withdrawal;
- user-facing migration or downgrade instructions;
- issue and release-note links for the incident.

Never rewrite published tags. A corrective release gets a new version and
changelog entry.

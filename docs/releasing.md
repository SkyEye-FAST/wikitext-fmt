# Release guide

This guide covers the independently versioned `wikitext-fmt` npm package and
`wikitext-formatter` VS Code extension. Core publication is automated after a
reviewed component tag is pushed. A reviewed extension tag produces a verified
VSIX and GitHub Release, while Marketplace upload remains a separate manual
process. Ordinary development does not publish or tag anything.

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
- Regenerate the lockfile with pnpm only when dependency/importer metadata
  changed.

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
VSCODE_TEST_VERSION=1.100.0 pnpm check:extension
VSCODE_TEST_VERSION=1.100.0 pnpm check:vsix
VSCODE_TEST_VERSION=stable pnpm check:extension
VSCODE_TEST_VERSION=stable pnpm check:vsix
pnpm check:vscode-release
```

Confirm Format Document and format on save in a clean VS Code profile. Verify
safe warning/no-edit behavior and a representative config discovery case.

The VSIX must contain `dist/extension.js`, package metadata, README, changelog,
license, `images/icon.png`, and required parser config assets. It must exclude
source, tests, scripts, TypeScript configs, generated declarations/maps,
previous VSIX files, and repository-only core docs.

## 6. Package contents

Inspect the npm file list:

```sh
pnpm pack --dry-run
pnpm check:browser
pnpm check:core-package-content
```

The package must contain:

- `dist`, including `browser.js`, `browser.d.ts`, and the runtime adapter;
- root `README.md`, `CHANGELOG.md`, and `LICENSE`;
- the complete user/contributor `docs/` hierarchy;
- generated runtime parser/localization JSON and the declared parser dependency
  containing the bundled browser runtime/configuration assets.

The browser bundle check must resolve the published `wikitext-fmt/browser`
subpath without marking Node built-ins external. Release smoke tests import both
the root and browser subpaths from the packed installation.

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

Then run the relevant component check:

```sh
pnpm check:release-metadata -- \
  --component core \
  --tag "core-v$(node -p "require('./package.json').version")"
pnpm check:vscode-release-metadata
```

This check is intentionally expected to fail during ordinary development while
current work remains under `Unreleased`.

## 8. Core release automation

Core verification and release operations are deliberately separate workflows:

```text
.github/workflows/checks.yml       # Checks
.github/workflows/release-core.yml # Core release
.github/workflows/release-vscode.yml # VS Code release
```

`Checks` handles branch pushes, pull requests, and manual runs with read-only
repository access. It never reacts to release tags. `Core release` reacts to
exactly `core-v*` tag pushes and also supports manual verification. A manual
dispatch runs the complete verification job, including a dry run of the exact
tarball publication command, but never reaches npm publication or GitHub
Release creation.

The release workflow has three least-privilege jobs:

- `verify`: `contents: read`; validates the tag, default-branch ancestry,
  metadata, changelog, package allowlist, checks, corpus, exact tarball,
  installed-package smoke test, release notes, and checksum;
- `publish-npm`: `contents: read` and `id-token: write`; uses the protected
  `npm` environment and publishes only the exact verified core tarball;
- `github-release`: `contents: write`; creates or completes the matching GitHub
  Release only after npm succeeds or an existing matching npm version is
  verified. It has no OIDC permission.

The jobs pass one uploaded `release-artifacts/` directory containing the npm
tarball, `SHA256SUMS`, `release-notes.md`, and machine-readable release
metadata. The publication job does not rebuild the package.

GitHub Actions checks out the exact release commit, so a tag-triggered run uses
a detached `HEAD`. The production command intentionally passes
`--no-git-checks` when publishing the verified tarball. pnpm's normal
branch-attached check is redundant there because the workflow already proves
the exact tag format and commit, default-branch ancestry, package and changelog
metadata, tarball contents, installation smoke test, and checksum before
publication. The bypass is present only on the CI commands that dry-run or
publish that exact tarball. Local or maintainer-run publishing commands must
retain pnpm's normal Git checks.

The filename `release-core.yml` is part of npm Trusted Publisher identity.
Renaming it later requires an npm package-settings update.

## 9. VS Code release automation

`VS Code release` reacts only to `vscode-v*` tag pushes and also supports a
manual verification dispatch. Manual dispatch validates release metadata,
builds the VSIX, runs the version matrix, and uploads the workflow artifact,
but it never creates a GitHub Release or publishes to the Marketplace.

The workflow uses three least-privilege jobs:

- `verify`: `contents: read`; checks the exact component tag, default-branch
  ancestry, finalized extension changelog and metadata, type checking, unit
  tests, package contents, and builds exactly one VSIX plus `SHA256SUMS`;
- `vscode-tests`: `contents: read`; installs dependencies at the exact release
  commit, downloads that same VSIX, and tests both the development extension
  and independently installed VSIX with VS Code 1.100.0 and current stable;
- `github-release`: `contents: write`; runs only for a real matching tag push,
  verifies or completes matching release metadata and assets, and attaches the
  exact verified VSIX and checksum without rebuilding.

The development and VSIX runners select the editor with
`VSCODE_TEST_VERSION`. Within one matrix job they share the package's
`.vscode-test` cache, so the same editor build is not downloaded twice. The
installed-VSIX test uses a temporary extension directory and activates the
packaged extension without relying on the pnpm workspace at runtime.

The GitHub Release title is `Wikitext Formatter <version>`, and its notes are
the matching non-empty `packages/vscode/CHANGELOG.md` section. A matching draft
can be completed; a conflicting published release, checksum, VSIX, or
unexpected release asset fails for maintainer review. The workflow never moves
or overwrites the tag.

Marketplace publishing is intentionally absent. Do not configure `VSCE_PAT`,
an Azure DevOps PAT, or another long-lived Marketplace credential. Keep upload
manual until an Entra ID or workload-identity design has been reviewed and
implemented.

## 10. One-time npm and GitHub configuration

Create a protected GitHub Environment named exactly `npm`. Restrict deployment
branches/tags appropriately and require reviewers for production approval.

In the npm package settings, configure:

```text
Provider: GitHub Actions
Owner or organization: SkyEye-FAST
Repository: wikitext-fmt
Workflow filename: release-core.yml
Environment: npm
Allowed action: npm publish
```

The workflow filename and environment name are case-sensitive trust inputs and
must match exactly. The workflow uses a GitHub-hosted runner and OIDC only; do
not configure `NPM_TOKEN` or another long-lived publish secret.

`actions/setup-node` writes an npm configuration containing a
`${NODE_AUTH_TOKEN}` placeholder when `registry-url` is set. pnpm may therefore
warn that it could not replace that variable during an OIDC Trusted Publishing
run. The warning alone does not indicate an authentication failure: no
long-lived npm token is required, and an empty or synthetic `NODE_AUTH_TOKEN`
must not be added merely to suppress it. Diagnose authentication from the
actual publish result and the Trusted Publisher identity and OIDC permissions.

If npm does not allow Trusted Publisher configuration before the package's
first publication, perform a one-time bootstrap publication from the reviewed
core tag commit with a maintainer account protected by 2FA. Publish the exact
reviewed tarball and intended dist-tag, then configure the Trusted Publisher
before rerunning the tag workflow. There is intentionally no automated token
fallback.

After OIDC publication works, restrict traditional token publishing where
appropriate and revoke obsolete npm automation tokens.

## 11. Tag and initiate a core release

Use component-specific names derived from the finalized package versions:

```text
core-v<version>
vscode-v<version>
```

Do not create a shared ambiguous tag. Verify the commit and reviewed artifact
before creating signed or annotated tags. The metadata check prints expected
names but does not create or prove tags.

For a stable core release:

```sh
version="$(node -p "require('./package.json').version")"

git checkout master
git pull --ff-only
pnpm check
pnpm corpus
git tag -s "core-v$version" -m "wikitext-fmt $version"
git push origin "core-v$version"
```

Pushing the component tag starts npm publication and, only after npm succeeds,
GitHub Release creation. The workflow itself never creates or moves the tag.
The script enforces the exact `core-v<valid-semver>` format and equality with
the root package version; the permissive trigger glob is not the validator.

Stable versions publish with npm dist-tag `latest`. SemVer prereleases such as
`0.3.0-beta.1` publish with `next` and become GitHub prereleases.

Release notes are the non-empty body of the exact matching core
`CHANGELOG.md` version section. The GitHub Release title is
`wikitext-fmt <version>`.

## 12. Partial failures and reruns

npm versions are immutable and cannot be overwritten. Before publication, the
workflow queries the exact version once. An absent version requires publication;
an existing conflict fails immediately without retrying.

Recovery of an already published version verifies package name and version,
repository type and URL, the expected npm dist-tag, and the exact verified
tarball's npm-compatible SHA-512 `dist.integrity` and SHA-1 `dist.shasum`.
`gitHead` must match the release commit when npm provides it. A missing
`gitHead` does not by itself conflict when both exact tarball hashes and all
other package identity checks match.

The post-publication registry check retries while a newly published version is
absent or its metadata is temporarily incomplete or stale. It succeeds only
when every required value matches and throws the last meaningful validation
error when a mismatch persists.

For a transient operational failure with unchanged tagged code, rerun the
failed jobs from the original tag workflow. A rerun uses the workflow and
scripts from the original tagged commit; it does not pick up fixes from the
current `master` branch. If npm succeeded but GitHub Release creation failed,
the npm check recognizes the same immutable publication and allows recovery to
continue. A matching draft is completed; a matching published release and its
exact assets are verified; a conflicting published release fails for
maintainer review.

If the workflow or a release script is defective in the tagged commit, complete
that release manually only when it is safe, and fix forward on `master`.
Ordinarily, use the corrected workflow for the next version.

Do not delete or move a tag merely to retry unchanged code. A failed tag for
an unpublished version may be recreated on the reviewed fix only after
independently confirming that both the exact npm version and its GitHub Release
are absent. If either exists, the tag must never be moved and the fix requires
the next version. Never attempt to overwrite an npm version.

## 13. Verify the core registry release

After a successful run:

```sh
version="$(node -p "require('./package.json').version")"

pnpm view "wikitext-fmt@$version" \
  version repository gitHead dist.integrity dist.shasum dist-tags

pnpm dlx "wikitext-fmt@$version" --version
```

Confirm the GitHub Release tag, title, prerelease state, changelog-derived body,
tarball, and `SHA256SUMS`. Call a version released in documentation only after
registry and tag/release evidence agree.

## 14. Tag, GitHub Release, and Marketplace publication

The intended extension process is:

1. Finalize `packages/vscode/package.json` and
   `packages/vscode/CHANGELOG.md`, leaving `Unreleased` empty.
2. Run all extension release checks, including VS Code 1.100.0 and stable.
3. Merge the reviewed release-preparation commit to `master`.
4. Create a signed or annotated `vscode-v<version>` tag at that exact commit.
5. Push only that component tag.
6. Let GitHub Actions verify the exact VSIX and checksum and create or complete
   the GitHub Release.
7. Manually upload that exact VSIX to the Visual Studio Code Marketplace.
8. Install from the Marketplace in a clean profile and verify activation,
   formatting, and bundled parser assets without workspace dependencies.
9. Confirm the Marketplace version, component tag, GitHub Release, VSIX
   checksum, and source commit all agree.

Before the first upload, confirm in Marketplace publisher management that the
publisher ID is exactly `skyeyefast`. The expected immutable extension
identifier is:

```text
skyeyefast.wikitext-formatter
```

After the reviewed release-preparation commit is merged, create and push the
tag with:

```sh
version="$(node -p "require('./packages/vscode/package.json').version")"

git checkout master
git pull --ff-only
pnpm check:vscode-release-metadata
pnpm check:vscode-release
git tag -s "vscode-v$version" -m "Wikitext Formatter $version"
git push origin "vscode-v$version"
```

Use `git tag -a` instead of `git tag -s` only when an annotated but unsigned
tag is the reviewed project choice. Do not use `vsce publish patch`,
`vsce publish minor`, or `vsce publish major`: those commands mutate the
extension version and do not preserve this repository's independently
versioned components and component-specific tags.

Download the VSIX and `SHA256SUMS` from the successful GitHub Release (or retain
the byte-identical verified workflow artifact), verify the checksum, and upload
the VSIX through the Marketplace publisher portal. Do not rebuild it locally.
After upload, install `skyeyefast.wikitext-formatter` from the Marketplace in a
clean profile and confirm Format Document changes a representative `.wiki`
file.

## 15. Post-release verification

- Confirm registry and Marketplace versions independently.
- Confirm component-specific Git tags/releases point to the published commit.
- Record artifact checksums or links.
- Re-open `Unreleased` for subsequent development.
- Check that docs call the version released only after publication/tag evidence
  is available.

## 16. Rollback

Record before publication:

- previous known-good npm/VSIX versions;
- who can deprecate an npm version or remove/replace a Marketplace release;
- whether a fix-forward patch is safer than withdrawal;
- user-facing migration or downgrade instructions;
- issue and release-note links for the incident.

Never rewrite published tags. A corrective release gets a new version and
changelog entry.

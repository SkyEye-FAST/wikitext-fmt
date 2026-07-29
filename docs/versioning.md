# Versioning policy

`wikitext-fmt` uses [Semantic Versioning 2.0.0](https://semver.org/) for:

- the `wikitext-fmt` npm package (core API and CLI);
- the `wikitext-formatter` VS Code extension.

Both components are pre-1.0 and independently versioned.

## Version state is not publication state

Keep these facts separate:

- **Current development version**: the value in a component's `package.json`.
- **Unreleased changes**: user-visible work under `## Unreleased` in that
  component's changelog.
- **Prepared release**: package metadata and a finalized changelog have passed
  release-mode checks, but artifacts may not be published or tagged.
- **Released version**: publication and component-specific tag/release evidence
  have been independently verified.

Published core releases are available through npm, and the released VS Code
extension follows its own version and publication lifecycle. A package version
or dated changelog heading alone remains insufficient publication evidence;
verify the corresponding registry or Marketplace entry and component-specific
tag or release.

Normal development keeps new work under `Unreleased`. Release finalization
moves selected items into a version heading. Core publication is initiated
later by an explicit component tag; extension publication remains independent.

## Pre-1.0 version selection

| Change | Version |
| --- | --- |
| Meaningful feature release, substantial behavioral expansion, or pre-1.0 compatibility change | `0.MINOR.0` |
| Backward-compatible bug fix, documentation correction, packaging fix, or narrowly scoped maintenance | `0.MINOR.PATCH` |

Examples:

- adding a rule, changing default formatting, or redesigning a report schema
  selects the next `0.MINOR.0`;
- fixing one false-positive parser boundary without changing supported
  behavior selects the next `0.MINOR.PATCH`;
- correcting docs or package contents selects a patch;
- removing or renaming a public option before 1.0 selects a minor and must be
  labelled breaking.

Breaking changes are explicit even before 1.0.

## Compatibility categories

Review each surface:

- public JavaScript exports, types, result objects, and failure codes;
- CLI arguments, streams, exit statuses, config discovery, and JSON reports;
- config keys, values, defaults, profiles, and validation;
- formatted output, rule eligibility, localization, and fail-closed behavior;
- npm package contents and supported Node.js versions;
- extension commands, settings, language support, VS Code compatibility,
  bundled core behavior, and VSIX contents.

A safety-driven narrowing can still be compatibility-significant when it
preserves more source instead of changing it.

## Independent components

Core and extension versions may match, but they are never forced to. A
core-only change does not bump the unchanged extension. When the extension
bundles a new core that changes editor-visible formatting, diagnostics, safety,
or runtime requirements, evaluate and record an extension release.

Use unambiguous tag and release names:

```text
core-v<version>
vscode-v<version>
```

Do not introduce a shared `v<version>` tag after component versions can diverge.

## Changelogs

- Root `CHANGELOG.md`: core, API, CLI, formatter, and npm packaging.
- `packages/vscode/CHANGELOG.md`: editor-visible and VSIX changes.

Keep `Unreleased` first. Every user-visible change belongs there during
development. At release finalization:

1. move only the selected component's release items into `## VERSION -
   YYYY-MM-DD`;
2. use non-empty Keep a Changelog categories such as `Added`, `Changed`,
   `Fixed`, or `Security`;
3. leave `Unreleased` empty;
4. label breaking changes;
5. never invent a historical date or behavior.

## Development versus release checks

```sh
pnpm check:versions
```

The normal offline check validates both SemVer strings, changelog presence, the
extension's local core dependency, and lockfile linkage. It does not require a
release heading or imply publication.

For a finalized core release, validate the proposed component tag:

```sh
version="$(node -p "require('./package.json').version")"

pnpm check:release-metadata -- \
  --component core \
  --tag "core-v$version"
```

This derives the package name and version, exact tag, stable or prerelease
status, npm dist-tag, release title, changelog notes, tarball name, and
repository identity from repository metadata. It requires the core version to
be the newest changelog release heading and the core `Unreleased` section to be
empty.

For a finalized extension release, use:

```sh
pnpm check:vscode-release-metadata
```

Run release-mode checks only after the relevant changelog is finalized. They do
not create or prove a tag, publication, Marketplace upload, or registry
release.

## Release preparation

1. Classify compatibility and choose component versions before editing
   metadata.
2. Update only components being released.
3. Finalize relevant changelogs.
4. Regenerate the lockfile with pnpm only if dependency/importer metadata
   changes.
5. Run normal, docs, package, corpus, extension, and component-specific
   release-mode checks.
6. Review exact npm and VSIX artifacts.
7. Tag and publish only after approval.

See [Releasing](releasing.md).

## Criteria for 1.0.0

Feature count is insufficient. A 1.0 declaration requires an intentional
stability commitment for:

- public JavaScript API and TypeScript types;
- CLI arguments, streams, exit codes, and report schemas;
- configuration schema, profiles, defaults, and migration policy;
- formatter behavior and fail-closed guarantees;
- supported runtimes and distributed package/VSIX contents;
- independent release, rollback, and support processes.

It also requires representative corpus evidence, repeatable release checks,
documented limitations, and a migration plan for remaining pre-1.0 changes.
The commitment must be stated in release notes.

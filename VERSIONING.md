# Versioning policy

`wikitext-fmt` uses [Semantic Versioning 2.0.0](https://semver.org/) for both
releaseable components:

- the `wikitext-fmt` npm package, which includes the core API and CLI;
- the `wikitext-formatter` VS Code extension.

Both components are currently pre-1.0. A `0.x` version signals active
development, not an absence of release discipline.

## Pre-1.0 version selection

| Change | Version |
| --- | --- |
| Meaningful feature release, substantial behavioral expansion, or pre-1.0 compatibility change | `0.MINOR.0` |
| Backward-compatible bug fix, documentation correction, packaging fix, or narrowly scoped maintenance | `0.MINOR.PATCH` |

Examples:

- adding a formatter rule, changing default formatting, or redesigning the CLI
  report schema selects the next `0.MINOR.0`;
- fixing one parser-boundary false positive without changing supported behavior
  selects the next `0.MINOR.PATCH`;
- correcting README examples or repairing package contents selects a patch;
- removing or renaming a public option before 1.0 selects a minor and must be
  labelled as breaking.

Pre-1.0 does not make breaking changes invisible. Release notes must explicitly
identify changes that require users to update API calls, CLI invocations,
configuration, automation, or editor settings.

## Compatibility categories

Consider each surface independently when selecting a version:

- public JavaScript exports, types, result objects, and failure codes;
- CLI arguments, streams, exit codes, config discovery, and JSON reports;
- configuration keys, values, defaults, profiles, and rule behavior;
- formatted output, rule eligibility, localization, and safe fallback;
- npm package contents and supported Node.js versions;
- extension commands, settings, language support, VS Code compatibility,
  bundled core behavior, and VSIX contents.

A safety-driven narrowing can still be compatibility-significant even when it
preserves source instead of changing it.

## Independent component versions

The core package and extension have independent version numbers. They may be
released together at the same version, but a core-only or extension-only change
does not force the unchanged component to bump.

The extension bundles the workspace core. When a core release changes
extension-visible formatting, diagnostics, runtime requirements, or safety
behavior, evaluate and record an extension release as well. The workspace
dependency must remain resolvable during the VSIX build.

Use component-specific tags and release names:

```text
core-v0.2.0
vscode-v0.2.0
```

Never use an ambiguous shared tag after the versions diverge.

## Changelogs

Every user-visible change belongs in the relevant changelog:

- root `CHANGELOG.md` for the package, API, CLI, formatter, and core packaging;
- `packages/vscode/CHANGELOG.md` for editor-visible or VSIX changes.

Keep an `Unreleased` heading at the top. During release preparation, move all
items being released into a version heading, group them under non-empty
Keep a Changelog categories such as `Added`, `Changed`, `Fixed`, or `Security`,
and leave `Unreleased` empty. Mark breaking changes explicitly. Do not invent
historical dates or behavior.

## Release preparation

1. Classify compatibility impact and choose each component version before
   editing package metadata.
2. Update only the package files for components being released.
3. Update each relevant changelog and leave released items out of
   `Unreleased`.
4. Regenerate `pnpm-lock.yaml` with pnpm if dependency/importer metadata
   changes; never edit unrelated lockfile content manually.
5. Run `pnpm check:versions`, build, and verify `wikitext-fmt --version` and
   `-v`.
6. Complete [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), including the core,
   corpus, extension, package, and VSIX checks that apply.
7. Create component-specific tags and release records only after the reviewed
   artifacts are ready.

`pnpm check:versions` is offline. It validates both SemVer strings, checks that
the newest release heading in each changelog matches its package, and verifies
that the extension workspace dependency still resolves to the local core.

## Criteria for 1.0.0

Feature count alone does not justify `1.0.0`. A 1.0 declaration requires an
intentional stability commitment for:

- the public JavaScript API and TypeScript types;
- CLI arguments, streams, exit codes, and report schemas;
- the configuration schema, profiles, defaults, and compatibility policy;
- documented formatter behavior and fail-closed safety guarantees;
- supported runtimes and distributed package/VSIX contents;
- independent core and extension release, migration, and rollback processes.

The project should also have representative corpus evidence, repeatable release
checks, documented known limitations, and a migration plan for any remaining
pre-1.0 changes. The declaration and guarantees must be recorded in release
notes; it is not an automatic consequence of maturity or elapsed time.

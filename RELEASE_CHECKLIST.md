# Release checklist

Use this checklist for both the `wikitext-fmt` npm package and the
`wikitext-formatter` VS Code extension. Run commands from the repository root
on a clean worktree unless noted otherwise.

## Runtime and dependency baseline

- [ ] Confirm the release is tested on Node.js 22.13 or newer on the 22.x line,
      and Node.js 24.11 or newer.
- [ ] Confirm the `engines.node` range in `package.json` matches the supported
      CI runtimes.
- [ ] Run `pnpm install --frozen-lockfile` (or `pnpm install` when intentionally
      updating the lockfile).
- [ ] Review dependency and lockfile changes, especially `wikiparser-node`.

## Build and verification

- [ ] Run `pnpm build`.
- [ ] Run `pnpm test:run`.
- [ ] Run `pnpm check`.
- [ ] Run `pnpm check:extension`.
- [ ] Run `pnpm check:vsix`.
- [ ] Run `pnpm check:vscode-release`.
- [ ] Confirm real-page matrix tests report no safe fallbacks and remain
      idempotent.

## Package contents

- [ ] Run `pnpm pack --dry-run` and inspect the npm package file list.
- [ ] Confirm the npm tarball contains `dist`, `README.md`, and `LICENSE`,
      including generated parser/localization JSON required at runtime.
- [ ] Confirm the npm tarball excludes source tests, fixtures, local reports,
      editor build products, and credentials.
- [ ] Run `pnpm --filter wikitext-formatter check:package-content` and inspect
      the VSIX file list produced by `pnpm --filter wikitext-formatter
      vscode:package`.
- [ ] Confirm the VSIX contains `dist/extension.js` and the copied
      `wikiparser-node` runtime config assets, and excludes source, tests,
      TypeScript configs, and previously built VSIX files.

## Documentation and versions

- [ ] Re-read the root README and extension README against CLI help, API
      defaults, config schema, and VS Code settings.
- [ ] Confirm production-safe, experimental, siteinfo, diagnostics, and report
      examples are accurate.
- [ ] Update the root changelog/release notes for user-visible core and CLI
      changes; update `packages/vscode/CHANGELOG.md` for extension changes.
- [ ] Choose versions according to compatibility impact and update the root
      package and extension package independently where appropriate.
- [ ] Confirm git tags and release titles match the package versions.

## Manual publishing

- [ ] Authenticate to the intended npm registry and verify package ownership.
- [ ] Pack once more, inspect the exact tarball, then publish that reviewed
      version with the intended npm dist-tag.
- [ ] Build the VSIX once more, install that exact file into a clean VS Code
      profile, and manually format a representative `.wiki` document.
- [ ] Authenticate the `skyeyefast` publisher and upload the reviewed VSIX to
      the Visual Studio Marketplace with the intended release notes.
- [ ] Push signed/annotated tags and publish repository releases with checksums
      or links for the npm package and VSIX as appropriate.
- [ ] Verify registry and Marketplace installation in clean environments, then
      record any rollback or follow-up action.

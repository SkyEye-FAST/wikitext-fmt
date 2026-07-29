# Getting started

## Requirements

Supported runtimes are Node.js `^22.13.0` or `>=24.11.0`. The npm package works
with npm; repository development uses the pnpm release pinned in
`package.json`.

## Install

Install the command globally:

```sh
npm install --global wikitext-fmt
```

Or add the JavaScript library to a project:

```sh
npm install wikitext-fmt
```

For a repository checkout:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

## First CLI run

Start by printing accepted output rather than modifying the file:

```sh
wikitext-fmt page.wiki
```

Check whether formatting is needed without emitting formatted text:

```sh
wikitext-fmt --safe --check --fail-on-warning page.wiki
```

Review an exact unified diff:

```sh
wikitext-fmt --safe --diff --fail-on-warning page.wiki
```

Read one document from stdin:

```sh
cat page.wiki | wikitext-fmt --safe --stdin
```

After reviewing output, write it in place:

```sh
wikitext-fmt --safe --write page.wiki
```

The `production` and `aggressive` CLI profiles select the idempotency-checking
path automatically. Warnings still exit successfully unless
`--fail-on-warning` is present.

## First API call

```ts
import { formatWikitextSafe } from "wikitext-fmt";

const source = "==Title==\n";
const result = formatWikitextSafe(source);

if (result.failure) {
  console.error(result.failure.code, result.warning);
} else {
  console.log(result.formatted);
}
```

The base formatter pipeline is already fail-closed. The safe API adds a second
formatting pass and requires exact idempotency. See
[Safety and diagnostics](safety-and-diagnostics.md).

## VS Code

The `wikitext-formatter` extension is a separately versioned wrapper that
bundles this core formatter. It provides Format Document and format on save,
but does not add syntax highlighting, an LSP server, or automatic siteinfo
fetching. See the
[extension guide](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/packages/vscode/README.md).

## Next steps

- Learn all CLI modes in [CLI reference](cli.md).
- Select profiles and options in [Configuration](configuration.md).
- Review exact transformations in [Formatting rules](rules.md).
- Configure site aliases with [Localization](localization.md).

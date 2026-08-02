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

The `production` profile enables every mature normal rule and selects the
idempotency-checking path automatically, making it the recommended preset for
routine automation. This includes parser-confirmed interlanguage-footer layout;
explicit rule and placement options can override the preset. Warnings still exit
successfully unless `--fail-on-warning` is present.

For a site-specific project, add a `.wikitext-fmt.json` that identifies the
MediaWiki API and the matching wikiparser-node configuration:

```json
{
  "profile": "production",
  "site": {
    "apiUrl": "https://wiki.arcaea.cn/api.php",
    "parserConfig": "./config/wiki.arcaea.cn.json",
    "cachePath": ".wikitext-fmt/site-config.json",
    "cacheMaxAgeSeconds": 86400,
    "allowStaleCache": true
  }
}
```

Relative paths are resolved from the project configuration file. To make runs
fully reproducible and offline, replace `apiUrl` and `cachePath` with a committed
`site.snapshotPath`. Inspect the effective data and its source before formatting:

```sh
wikitext-fmt --print-site-configuration
```

See [Configuration](configuration.md) for online, offline snapshot, and temporary
CLI override examples.

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

Template layout is based on the final parser-safe candidate. An originally
single-line named or explicitly numbered template stays inline when its
normalized candidate fits `lineWidth`, regardless of parameter count or
harmless source whitespace; otherwise it uses `templateParameterLayout`.
Existing multiline templates stay multiline, while anonymous parameters follow
a separate conservative, byte-preserving policy.

## VS Code

The `wikitext-formatter` extension is a separately versioned wrapper that
bundles this core formatter. It provides Format Document and format on save,
but does not add syntax highlighting or an LSP server. It uses the same project
site configuration resolver as the CLI; network access is limited to trusted
workspaces, while untrusted workspaces may use a local snapshot. See the
[extension guide](https://github.com/SkyEye-FAST/wikitext-fmt/blob/master/packages/vscode/README.md).

## Next steps

- Learn all CLI modes in [CLI reference](cli.md).
- Select profiles and options in [Configuration](configuration.md).
- Review exact transformations in [Formatting rules](rules.md).
- Configure site data and aliases with [Localization](localization.md).

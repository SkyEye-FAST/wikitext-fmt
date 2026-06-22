import { build } from "esbuild";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const require = createRequire(resolve(workspaceRoot, "package.json"));

async function copyJsonDirectory(source, destination) {
  await mkdir(destination, { recursive: true });

  const entries = await readdir(source, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyJsonDirectory(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function copyWikiparserRuntimeAssets(destinationRoot) {
  const sourcePackageJson = require.resolve("wikiparser-node/package.json");
  const sourceRoot = dirname(sourcePackageJson);

  await rm(destinationRoot, { force: true, recursive: true });
  await mkdir(destinationRoot, { recursive: true });
  await copyFile(sourcePackageJson, resolve(destinationRoot, "package.json"));
  await copyJsonDirectory(
    resolve(sourceRoot, "config"),
    resolve(destinationRoot, "config"),
  );
}

await rm(resolve(packageRoot, "dist"), { force: true, recursive: true });
await mkdir(resolve(packageRoot, "dist"), { recursive: true });

await build({
  banner: {
    js: [
      'import { dirname as __wikitextFmtDirname } from "node:path";',
      'import { fileURLToPath as __wikitextFmtFileURLToPath } from "node:url";',
      'import { createRequire as __wikitextFmtCreateRequire } from "node:module";',
      "const __filename = __wikitextFmtFileURLToPath(import.meta.url);",
      "const __dirname = __wikitextFmtDirname(__filename);",
      "const require = __wikitextFmtCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  bundle: true,
  entryPoints: [resolve(packageRoot, "src/extension.ts")],
  external: ["vscode", "node:*", "inspector/promises"],
  format: "esm",
  legalComments: "none",
  logLevel: "info",
  outfile: resolve(packageRoot, "dist/extension.js"),
  platform: "node",
  sourcemap: false,
  target: "node20",
});

// The formatter core has a bundled fallback for the generic default/mediawiki
// parser config. Keep these minimal wikiparser-node runtime assets in the VSIX
// so explicit named parser configs such as enwiki/zhwiki can still resolve if
// the extension exposes parser-config selection later.
await copyWikiparserRuntimeAssets(
  resolve(packageRoot, "node_modules/wikiparser-node"),
);
await copyWikiparserRuntimeAssets(
  resolve(packageRoot, "dist/node_modules/wikiparser-node"),
);

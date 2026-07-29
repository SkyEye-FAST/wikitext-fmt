#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";

const entry = await import("../dist/index.js");
if (entry.formatWikitext("==Title==\n") !== "== Title ==\n") {
  throw new Error("dist/index.js formatWikitext smoke failed");
}
if (typeof entry.loadSiteInfoAliases !== "function") {
  throw new Error("loadSiteInfoAliases is not exported from dist/index.js");
}

const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
for (const flag of ["--version", "-v"]) {
  const result = spawnSync(process.execPath, ["dist/cli.js", flag], {
    encoding: "utf8",
  });
  if (
    result.status !== 0 ||
    result.stdout !== `${packageMetadata.version}\n` ||
    result.stderr !== ""
  ) {
    throw new Error(`dist/cli.js ${flag} version smoke failed`);
  }
}

for (const path of [
  "docs/README.md",
  "docs/cli.md",
  "docs/configuration.md",
  "docs/versioning.md",
  "docs/releasing.md",
]) {
  await access(path);
}

await access("dist/localization/generated/mediawiki-aliases.json");
const aliases = await import(
  "../dist/localization/generated/mediawiki-aliases.json",
  {
    with: { type: "json" },
  }
);
if (!aliases.default.categoryNamespaces.includes("Kategorie")) {
  throw new Error("generated localization aliases were not emitted to dist");
}
if (!aliases.default.redirectMagicWords.includes("#REDIRECT")) {
  throw new Error("generated redirect aliases were not emitted to dist");
}
if (!aliases.default.fileNamespaces.includes("ファイル")) {
  throw new Error("generated file namespace aliases were not emitted to dist");
}
if (!aliases.default.imageOptionAliases.img_thumbnail.includes("サムネイル")) {
  throw new Error("generated image option aliases were not emitted to dist");
}

console.log("release smoke ok");

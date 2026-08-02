#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`,
    );
  }
  return result;
}

async function smokeTarball(tarball) {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "wikitext-fmt-release-"),
  );
  try {
    await writeFile(
      join(temporaryDirectory, "package.json"),
      '{"name":"wikitext-fmt-release-smoke","private":true,"type":"module"}\n',
    );
    run(
      "pnpm",
      [
        "--dir",
        temporaryDirectory,
        "add",
        "--ignore-workspace",
        resolve(tarball),
      ],
      { cwd: temporaryDirectory },
    );
    const version = run(
      join(temporaryDirectory, "node_modules/.bin/wikitext-fmt"),
      ["--version"],
      { cwd: temporaryDirectory },
    ).stdout.trim();
    const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
    if (version !== packageMetadata.version) {
      throw new Error(
        `installed tarball CLI version ${version} does not match ${packageMetadata.version}`,
      );
    }
    run(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'import { formatWikitext, formatWikitextSafe as formatRoot } from "wikitext-fmt"; import { formatWikitextSafe as formatBrowser } from "wikitext-fmt/browser"; if (formatWikitext("==Title==\\n") !== "== Title ==\\n") process.exit(1); for (const format of [formatRoot, formatBrowser]) { const reference = format(\'<ref name="a"/>\\n\', { profile: "production" }); const interlanguage = format("[[en:Example]]\\n\\nBody\\n", { profile: "production" }); if (reference.formatted !== \'<ref name="a" />\\n\' || reference.failure || interlanguage.formatted !== "Body\\n\\n[[en:Example]]\\n" || interlanguage.failure) process.exit(1); }',
      ],
      { cwd: temporaryDirectory },
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const entry = await import("../dist/index.js");
if (entry.formatWikitext("==Title==\n") !== "== Title ==\n") {
  throw new Error("dist/index.js formatWikitext smoke failed");
}
if (typeof entry.loadSiteInfoAliases !== "function") {
  throw new Error("loadSiteInfoAliases is not exported from dist/index.js");
}
const rootReference = entry.formatWikitextSafeDetailed('<ref name="a"/>\n', {
  profile: "production",
});
const rootInterlanguage = entry.formatWikitextSafeDetailed(
  "[[en:Example]]\n\nBody\n",
  { profile: "production" },
);
if (
  rootReference.formatted !== '<ref name="a" />\n' ||
  rootReference.failure ||
  rootInterlanguage.formatted !== "Body\n\n[[en:Example]]\n" ||
  rootInterlanguage.failure ||
  rootInterlanguage.footerDiagnostics.interlanguageLinksMoved !== 1
) {
  throw new Error("dist/index.js parser parity smoke failed");
}

const browserEntry = await import("../dist/browser.js");
const browserResult = browserEntry.formatWikitextSafe("==Title==\n");
if (
  browserResult.formatted !== "== Title ==\n" ||
  browserResult.failure !== undefined
) {
  throw new Error("dist/browser.js formatWikitextSafe smoke failed");
}
const browserReference = browserEntry.formatWikitextSafeDetailed('<ref name="a"/>\n', {
  profile: "production",
});
const browserInterlanguage = browserEntry.formatWikitextSafeDetailed(
  "[[en:Example]]\n\nBody\n",
  { profile: "production" },
);
if (
  browserReference.formatted !== '<ref name="a" />\n' ||
  browserReference.failure ||
  browserInterlanguage.formatted !== "Body\n\n[[en:Example]]\n" ||
  browserInterlanguage.failure ||
  browserInterlanguage.footerDiagnostics.interlanguageLinksMoved !== 1
) {
  throw new Error("dist/browser.js parser parity smoke failed");
}
const unsupportedBrowserResult = browserEntry.formatWikitextSafe("source", {
  parserConfig: "enwiki",
});
if (
  unsupportedBrowserResult.formatted !== "source" ||
  unsupportedBrowserResult.failure?.code !== "unsupported-parser-config"
) {
  throw new Error("dist/browser.js parser configuration fallback smoke failed");
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

const tarballIndex = process.argv.indexOf("--tarball");
if (tarballIndex !== -1) {
  const tarball = process.argv[tarballIndex + 1];
  if (!tarball) throw new Error("--tarball requires a path");
  await smokeTarball(tarball);
}

console.log("release smoke ok");

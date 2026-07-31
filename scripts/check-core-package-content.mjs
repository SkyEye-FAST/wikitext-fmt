#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCorePackageMetadata } from "./release-metadata.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const allowedTopLevelEntries = new Set([
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "dist",
  "docs",
]);
const requiredEntries = [
  "package/package.json",
  "package/README.md",
  "package/CHANGELOG.md",
  "package/LICENSE",
  "package/dist/index.js",
  "package/dist/index.d.ts",
  "package/dist/browser.js",
  "package/dist/browser.d.ts",
  "package/dist/parser.browser.js",
  "package/dist/cli.js",
  "package/dist/localization/generated/mediawiki-aliases.json",
  "package/docs/README.md",
  "package/docs/cli.md",
  "package/docs/configuration.md",
  "package/docs/versioning.md",
  "package/docs/releasing.md",
];
const forbiddenSegments =
  /(?:^|\/)(?:\.env(?:\.|$)|\.github|\.npmrc|benchmarks|coverage|dist-test|fixtures|node_modules|packages|release-artifacts|scripts|src|tests)(?:\/|$)/u;
const forbiddenFiles =
  /(?:\.log|\.tgz|\.vsix|corpus-.*-report\.json|benchmark-(?:current|comparison)-report\.json)$/u;

function normalizeEntry(entry) {
  const normalized = entry.replace(/^\.\//u, "").replace(/\/+$/u, "");
  return normalized.startsWith("package/") ? normalized : `package/${normalized}`;
}

export function readmeMarkdownLinks(contents) {
  const links = [];
  for (const match of contents.matchAll(/\]\(([^)]+)\)/gu)) {
    const target = match[1]?.trim();
    if (
      !target ||
      target.startsWith("#") ||
      /^[a-z][a-z\d+.-]*:/iu.test(target)
    ) {
      continue;
    }
    const path = decodeURIComponent(target.split("#", 1)[0]);
    if (path) links.push(normalizeEntry(path));
  }
  return links;
}

export function validateCorePackageEntries(entries, readmeContents) {
  const normalizedEntries = new Set(
    entries.map(normalizeEntry).filter((entry) => entry !== "package"),
  );
  const errors = [];

  for (const entry of requiredEntries) {
    if (!normalizedEntries.has(entry)) errors.push(`missing required file: ${entry}`);
  }
  for (const entry of readmeMarkdownLinks(readmeContents)) {
    if (!normalizedEntries.has(entry)) {
      errors.push(`README link is not included in the package: ${entry}`);
    }
  }
  for (const entry of normalizedEntries) {
    const relative = entry.slice("package/".length);
    const topLevel = relative.split("/", 1)[0];
    if (!allowedTopLevelEntries.has(topLevel)) {
      errors.push(`file is outside the package allowlist: ${entry}`);
    }
    if (forbiddenSegments.test(relative) || forbiddenFiles.test(relative)) {
      errors.push(`forbidden package file: ${entry}`);
    }
  }
  return errors;
}

function packageEntriesFromDryRun() {
  const output = execFileSync(
    "pnpm",
    ["pack", "--dry-run", "--json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  const result = JSON.parse(output);
  const files = Array.isArray(result) ? result[0]?.files : result.files;
  if (!Array.isArray(files)) {
    throw new Error("pnpm pack --dry-run --json did not return a file list");
  }
  return files.map((file) => file.path);
}

function packageEntriesFromTarball(tarball) {
  return execFileSync("tar", ["-tzf", tarball], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .filter(Boolean);
}

async function main() {
  const tarballArgument = process.argv[2];
  const entries = tarballArgument
    ? packageEntriesFromTarball(resolve(repositoryRoot, tarballArgument))
    : packageEntriesFromDryRun();
  const readmeContents = tarballArgument
    ? execFileSync(
        "tar",
        ["-xOf", resolve(repositoryRoot, tarballArgument), "package/README.md"],
        { cwd: repositoryRoot, encoding: "utf8" },
      )
    : await readFile(resolve(repositoryRoot, "README.md"), "utf8");
  const packageMetadataContents = tarballArgument
    ? execFileSync(
        "tar",
        [
          "-xOf",
          resolve(repositoryRoot, tarballArgument),
          "package/package.json",
        ],
        { cwd: repositoryRoot, encoding: "utf8" },
      )
    : await readFile(resolve(repositoryRoot, "package.json"), "utf8");
  validateCorePackageMetadata(JSON.parse(packageMetadataContents));
  const errors = validateCorePackageEntries(entries, readmeContents);
  if (errors.length > 0) {
    throw new Error(`core package content check failed:\n- ${errors.join("\n- ")}`);
  }
  console.log(`core package content ok (${entries.length} entries)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

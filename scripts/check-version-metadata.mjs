#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  changelogMetadata,
  isSemVer,
  validateCorePackageMetadata,
  validateVscodePackageMetadata,
} from "./release-metadata.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readText(path) {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const args = process.argv.slice(2);
const releaseTarget =
  args[0] === "--release" ? (args[1] ?? "all") : undefined;
const releaseMode = releaseTarget !== undefined;
assert(
  args.length === 0 ||
    (releaseMode &&
      args.length <= 2 &&
      ["all", "core", "vscode"].includes(releaseTarget)),
  "Usage: check-version-metadata.mjs [--release [all|core|vscode]]",
);

const corePackage = await readJson("package.json");
const extensionPackage = await readJson("packages/vscode/package.json");

validateCorePackageMetadata(corePackage);
validateVscodePackageMetadata(extensionPackage);
assert(
  isSemVer(corePackage.version),
  `package.json version is not valid SemVer: ${corePackage.version}`,
);
assert(
  isSemVer(extensionPackage.version),
  `packages/vscode/package.json version is not valid SemVer: ${extensionPackage.version}`,
);

const changelogs = [
  ["core", "CHANGELOG.md", corePackage.version],
  ["vscode", "packages/vscode/CHANGELOG.md", extensionPackage.version],
];
for (const [component, path, expectedVersion] of changelogs) {
  const metadata = changelogMetadata(await readText(path), path);
  if (
    releaseMode &&
    (releaseTarget === "all" || releaseTarget === component)
  ) {
    assert(
      metadata.currentRelease === expectedVersion,
      `${path} current release ${metadata.currentRelease ?? "(none)"} does not match package version ${expectedVersion}`,
    );
    assert(
      metadata.unreleased === "",
      `${path} Unreleased section must be empty when finalizing a release`,
    );
  }
}

assert(
  extensionPackage.dependencies?.["wikitext-fmt"] === "workspace:*",
  "packages/vscode must bundle the local core through wikitext-fmt workspace:*",
);

const lockfile = await readText("pnpm-lock.yaml");
assert(
  /  packages\/vscode:\r?\n(?: {4}.*\r?\n)*? {4}dependencies:\r?\n(?: {6}.*\r?\n)*? {6}wikitext-fmt:\r?\n {8}specifier: workspace:\*\r?\n {8}version: link:\.\.\/\.\./u.test(
    lockfile,
  ),
  "pnpm-lock.yaml must resolve the extension's core dependency to link:../..",
);

if (releaseMode) {
  const expectedTags = [];
  if (releaseTarget === "all" || releaseTarget === "core")
    expectedTags.push(`core-v${corePackage.version}`);
  if (releaseTarget === "all" || releaseTarget === "vscode")
    expectedTags.push(`vscode-v${extensionPackage.version}`);
  const tags = execFileSync("git", ["tag", "--list"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const releaseVersions = [];
  if (releaseTarget === "all" || releaseTarget === "core")
    releaseVersions.push(corePackage.version);
  if (releaseTarget === "all" || releaseTarget === "vscode")
    releaseVersions.push(extensionPackage.version);
  for (const version of releaseVersions) {
    const ambiguousTag = `v${version}`;
    assert(
      !tags.includes(ambiguousTag),
      `Ambiguous component tag is not allowed: ${ambiguousTag}`,
    );
  }
  console.log(
    `release metadata ok (expected tags: ${expectedTags.join(", ")})`,
  );
} else {
  console.log(
    `development version metadata ok (core ${corePackage.version}, vscode ${extensionPackage.version})`,
  );
}

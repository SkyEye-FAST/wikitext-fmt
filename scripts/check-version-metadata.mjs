#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readText(path) {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

function isSemVer(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(
      version,
    );
  if (!match) return false;
  return !match[4]
    ?.split(".")
    .some((identifier) => /^\d+$/u.test(identifier) && /^0\d+/u.test(identifier));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function currentChangelogVersion(contents, path) {
  assert(
    /^## Unreleased\s*$/mu.test(contents),
    `${path} must contain an Unreleased section`,
  );
  const releaseHeadings = [
    ...contents.matchAll(/^## (?!Unreleased\s*$)([^\s]+)(?: - \d{4}-\d{2}-\d{2})?\s*$/gmu),
  ];
  assert(releaseHeadings.length > 0, `${path} has no versioned release heading`);
  return releaseHeadings[0][1];
}

const corePackage = await readJson("package.json");
const extensionPackage = await readJson("packages/vscode/package.json");

assert(
  isSemVer(corePackage.version),
  `package.json version is not valid SemVer: ${corePackage.version}`,
);
assert(
  isSemVer(extensionPackage.version),
  `packages/vscode/package.json version is not valid SemVer: ${extensionPackage.version}`,
);

const changelogs = [
  ["CHANGELOG.md", corePackage.version],
  ["packages/vscode/CHANGELOG.md", extensionPackage.version],
];
for (const [path, expectedVersion] of changelogs) {
  const actualVersion = currentChangelogVersion(await readText(path), path);
  assert(
    actualVersion === expectedVersion,
    `${path} current release ${actualVersion} does not match package version ${expectedVersion}`,
  );
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

console.log(
  `version metadata ok (core ${corePackage.version}, vscode ${extensionPackage.version})`,
);

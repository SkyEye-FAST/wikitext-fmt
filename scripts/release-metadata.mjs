const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

export const CORE_PACKAGE_NAME = "wikitext-fmt";
export const CORE_REPOSITORY = "SkyEye-FAST/wikitext-fmt";
export const CORE_REPOSITORY_URL =
  "git+https://github.com/SkyEye-FAST/wikitext-fmt.git";
export const CORE_HOMEPAGE =
  "https://github.com/SkyEye-FAST/wikitext-fmt#readme";
export const CORE_BUGS_URL =
  "https://github.com/SkyEye-FAST/wikitext-fmt/issues";
export const CORE_REGISTRY = "https://registry.npmjs.org/";
export const CORE_PACKAGE_FILES = [
  "dist",
  "docs",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
];
export const VSCODE_EXTENSION_NAME = "wikitext-formatter";
export const VSCODE_EXTENSION_DISPLAY_NAME = "Wikitext Formatter";
export const VSCODE_EXTENSION_PUBLISHER = "skyeyefast";
export const VSCODE_EXTENSION_ID =
  `${VSCODE_EXTENSION_PUBLISHER}.${VSCODE_EXTENSION_NAME}`;
export const VSCODE_REPOSITORY_URL =
  "https://github.com/SkyEye-FAST/wikitext-fmt.git";
export const VSCODE_REPOSITORY_DIRECTORY = "packages/vscode";
export const VSCODE_HOMEPAGE =
  "https://github.com/SkyEye-FAST/wikitext-fmt#readme";
export const VSCODE_BUGS_URL =
  "https://github.com/SkyEye-FAST/wikitext-fmt/issues";
export const VSCODE_MINIMUM_ENGINE = "^1.100.0";
export const VSCODE_ICON = "images/icon.png";

export function assertRelease(condition, message) {
  if (!condition) throw new Error(message);
}

export function isSemVer(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) return false;
  return !match[4]
    ?.split(".")
    .some((identifier) => /^\d+$/u.test(identifier) && /^0\d+/u.test(identifier));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function sectionAfterHeading(contents, heading) {
  const remainder = contents.slice(heading.index + heading[0].length);
  const nextHeading = /^## /mu.exec(remainder);
  return nextHeading ? remainder.slice(0, nextHeading.index) : remainder;
}

export function changelogMetadata(contents, path = "CHANGELOG.md") {
  const unreleasedHeading = /^## Unreleased\s*$/mu.exec(contents);
  assertRelease(
    unreleasedHeading,
    `${path} must contain an Unreleased section`,
  );
  const releaseHeadings = [
    ...contents.matchAll(
      /^## (?!Unreleased\s*$)([^\s]+)(?: - \d{4}-\d{2}-\d{2})?\s*$/gmu,
    ),
  ];
  return {
    currentRelease: releaseHeadings[0]?.[1],
    unreleased: sectionAfterHeading(contents, unreleasedHeading).trim(),
  };
}

export function extractReleaseNotes(contents, version, path = "CHANGELOG.md") {
  const headingPattern = new RegExp(
    `^## ${escapeRegExp(version)}(?: - \\d{4}-\\d{2}-\\d{2})?\\s*$`,
    "mu",
  );
  const heading = headingPattern.exec(contents);
  assertRelease(heading, `${path} is missing a release heading for ${version}`);
  const notes = sectionAfterHeading(contents, heading).trim();
  assertRelease(notes !== "", `${path} release notes for ${version} are empty`);
  return `${notes}\n`;
}

function sameStringSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

export function validateCorePackageMetadata(packageMetadata) {
  assertRelease(
    packageMetadata.name === CORE_PACKAGE_NAME,
    `package.json name must be ${CORE_PACKAGE_NAME}`,
  );
  assertRelease(
    isSemVer(packageMetadata.version),
    `package.json version is not valid SemVer: ${packageMetadata.version}`,
  );
  assertRelease(
    packageMetadata.repository?.type === "git" &&
      packageMetadata.repository?.url === CORE_REPOSITORY_URL,
    `package.json repository must be ${CORE_REPOSITORY_URL}`,
  );
  assertRelease(
    packageMetadata.bugs?.url === CORE_BUGS_URL,
    `package.json bugs.url must be ${CORE_BUGS_URL}`,
  );
  assertRelease(
    packageMetadata.homepage === CORE_HOMEPAGE,
    `package.json homepage must be ${CORE_HOMEPAGE}`,
  );
  assertRelease(
    packageMetadata.publishConfig?.access === "public" &&
      packageMetadata.publishConfig?.registry === CORE_REGISTRY,
    "package.json publishConfig must select public access on the official npm registry",
  );
  assertRelease(
    sameStringSet(packageMetadata.files, CORE_PACKAGE_FILES),
    `package.json files must contain only: ${CORE_PACKAGE_FILES.join(", ")}`,
  );
  assertRelease(
    sameStringSet(Object.keys(packageMetadata.exports ?? {}), [".", "./browser"]),
    "package.json exports must contain only the package root and ./browser",
  );
  assertRelease(
    packageMetadata.main === "./dist/index.js" &&
      packageMetadata.types === "./dist/index.d.ts" &&
      packageMetadata.exports?.["."]?.types === "./dist/index.d.ts" &&
      packageMetadata.exports?.["."]?.import === "./dist/index.js",
    "package.json root export must resolve dist/index.js and dist/index.d.ts",
  );
  assertRelease(
    packageMetadata.exports?.["./browser"]?.types === "./dist/browser.d.ts" &&
      packageMetadata.exports?.["./browser"]?.import === "./dist/browser.js",
    "package.json browser export must resolve dist/browser.js and dist/browser.d.ts",
  );
}

export function validateVscodePackageMetadata(packageMetadata) {
  assertRelease(
    packageMetadata.name === VSCODE_EXTENSION_NAME,
    `packages/vscode/package.json name must be ${VSCODE_EXTENSION_NAME}`,
  );
  assertRelease(
    packageMetadata.displayName === VSCODE_EXTENSION_DISPLAY_NAME,
    `packages/vscode/package.json displayName must be ${VSCODE_EXTENSION_DISPLAY_NAME}`,
  );
  assertRelease(
    packageMetadata.publisher === VSCODE_EXTENSION_PUBLISHER,
    `packages/vscode/package.json publisher must be ${VSCODE_EXTENSION_PUBLISHER}`,
  );
  assertRelease(
    isSemVer(packageMetadata.version),
    `packages/vscode/package.json version is not valid SemVer: ${packageMetadata.version}`,
  );
  assertRelease(
    typeof packageMetadata.description === "string" &&
      packageMetadata.description.trim() !== "",
    "packages/vscode/package.json description must be non-empty",
  );
  assertRelease(
    packageMetadata.repository?.type === "git" &&
      packageMetadata.repository?.url === VSCODE_REPOSITORY_URL &&
      packageMetadata.repository?.directory === VSCODE_REPOSITORY_DIRECTORY,
    `packages/vscode/package.json repository must identify ${VSCODE_REPOSITORY_DIRECTORY} in ${VSCODE_REPOSITORY_URL}`,
  );
  assertRelease(
    packageMetadata.bugs?.url === VSCODE_BUGS_URL,
    `packages/vscode/package.json bugs.url must be ${VSCODE_BUGS_URL}`,
  );
  assertRelease(
    packageMetadata.homepage === VSCODE_HOMEPAGE,
    `packages/vscode/package.json homepage must be ${VSCODE_HOMEPAGE}`,
  );
  assertRelease(
    packageMetadata.license === "GPL-3.0-or-later",
    "packages/vscode/package.json license must be GPL-3.0-or-later",
  );
  assertRelease(
    packageMetadata.pricing === "Free",
    "packages/vscode/package.json pricing must be Free",
  );
  assertRelease(
    packageMetadata.categories?.includes("Formatters"),
    "packages/vscode/package.json categories must include Formatters",
  );
  assertRelease(
    ["wikitext", "mediawiki", "formatter"].every((keyword) =>
      packageMetadata.keywords?.includes(keyword),
    ),
    "packages/vscode/package.json keywords must include wikitext, mediawiki, and formatter",
  );
  assertRelease(
    typeof packageMetadata.galleryBanner?.color === "string" &&
      ["dark", "light"].includes(packageMetadata.galleryBanner?.theme),
    "packages/vscode/package.json galleryBanner must define a color and supported theme",
  );
  assertRelease(
    packageMetadata.icon === VSCODE_ICON,
    `packages/vscode/package.json icon must be ${VSCODE_ICON}`,
  );
  assertRelease(
    packageMetadata.engines?.vscode === VSCODE_MINIMUM_ENGINE,
    `packages/vscode/package.json engines.vscode must be ${VSCODE_MINIMUM_ENGINE}`,
  );
  assertRelease(
    packageMetadata.type === "module" &&
      packageMetadata.main === "./dist/extension.js",
    "packages/vscode/package.json must keep the ESM dist/extension.js entry point",
  );
}

export function prepareCoreRelease({
  tag,
  packageMetadata,
  changelog,
  commit,
}) {
  validateCorePackageMetadata(packageMetadata);
  assertRelease(
    typeof tag === "string" && tag.startsWith("core-v"),
    "core release tag must use the exact core-v<valid-semver> format",
  );
  const tagVersion = tag.slice("core-v".length);
  assertRelease(
    isSemVer(tagVersion),
    `core release tag version is not valid SemVer: ${tagVersion || "(empty)"}`,
  );
  const expectedTag = `core-v${packageMetadata.version}`;
  assertRelease(
    tag === expectedTag,
    `core release tag ${tag} does not match package version; expected ${expectedTag}`,
  );

  const changelogState = changelogMetadata(changelog);
  assertRelease(
    changelogState.currentRelease === packageMetadata.version,
    `CHANGELOG.md current release ${changelogState.currentRelease ?? "(none)"} does not match package version ${packageMetadata.version}`,
  );
  assertRelease(
    changelogState.unreleased === "",
    "CHANGELOG.md Unreleased section must be empty when finalizing a core release",
  );

  const prerelease = packageMetadata.version.includes("-");
  return {
    component: "core",
    packageName: packageMetadata.name,
    version: packageMetadata.version,
    expectedTag,
    prerelease,
    npmDistTag: prerelease ? "next" : "latest",
    githubReleaseTitle: `${packageMetadata.name} ${packageMetadata.version}`,
    releaseNotes: extractReleaseNotes(changelog, packageMetadata.version),
    tarballFilename: `${packageMetadata.name}-${packageMetadata.version}.tgz`,
    repository: CORE_REPOSITORY,
    repositoryUrl: CORE_REPOSITORY_URL,
    registry: CORE_REGISTRY,
    packageManager: packageMetadata.packageManager,
    commit,
  };
}

export function prepareVscodeRelease({
  tag,
  packageMetadata,
  changelog,
  commit,
  packageManager,
}) {
  validateVscodePackageMetadata(packageMetadata);
  assertRelease(
    typeof tag === "string" && tag.startsWith("vscode-v"),
    "VS Code release tag must use the exact vscode-v<valid-semver> format",
  );
  const tagVersion = tag.slice("vscode-v".length);
  assertRelease(
    isSemVer(tagVersion),
    `VS Code release tag version is not valid SemVer: ${tagVersion || "(empty)"}`,
  );
  const expectedTag = `vscode-v${packageMetadata.version}`;
  assertRelease(
    tag === expectedTag,
    `VS Code release tag ${tag} does not match extension version; expected ${expectedTag}`,
  );

  const changelogPath = "packages/vscode/CHANGELOG.md";
  const changelogState = changelogMetadata(changelog, changelogPath);
  assertRelease(
    changelogState.currentRelease === packageMetadata.version,
    `${changelogPath} current release ${changelogState.currentRelease ?? "(none)"} does not match extension version ${packageMetadata.version}`,
  );
  assertRelease(
    changelogState.unreleased === "",
    `${changelogPath} Unreleased section must be empty when finalizing a VS Code release`,
  );

  const prerelease = packageMetadata.version.includes("-");
  return {
    component: "vscode",
    extensionId: VSCODE_EXTENSION_ID,
    packageName: packageMetadata.name,
    version: packageMetadata.version,
    expectedTag,
    prerelease,
    githubReleaseTitle: `${packageMetadata.displayName} ${packageMetadata.version}`,
    releaseNotes: extractReleaseNotes(
      changelog,
      packageMetadata.version,
      changelogPath,
    ),
    vsixFilename: `${packageMetadata.name}-${packageMetadata.version}.vsix`,
    repository: CORE_REPOSITORY,
    repositoryUrl: VSCODE_REPOSITORY_URL,
    packageManager,
    commit,
  };
}

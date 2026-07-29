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

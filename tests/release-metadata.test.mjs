import { describe, expect, it } from "vitest";

import {
  CORE_BUGS_URL,
  CORE_HOMEPAGE,
  CORE_PACKAGE_FILES,
  CORE_REGISTRY,
  CORE_REPOSITORY_URL,
  VSCODE_BUGS_URL,
  VSCODE_HOMEPAGE,
  VSCODE_ICON,
  VSCODE_MINIMUM_ENGINE,
  VSCODE_REPOSITORY_DIRECTORY,
  VSCODE_REPOSITORY_URL,
  isSemVer,
  prepareCoreRelease,
  prepareVscodeRelease,
} from "../scripts/release-metadata.mjs";
import { assessRegistryVersion } from "../scripts/check-npm-release.mjs";
import { validateExistingGithubRelease } from "../scripts/check-github-release.mjs";

function packageMetadata(version = "0.2.0") {
  return {
    name: "wikitext-fmt",
    version,
    repository: { type: "git", url: CORE_REPOSITORY_URL },
    bugs: { url: CORE_BUGS_URL },
    homepage: CORE_HOMEPAGE,
    publishConfig: { access: "public", registry: CORE_REGISTRY },
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./browser": {
        types: "./dist/browser.d.ts",
        import: "./dist/browser.js",
      },
    },
    files: [...CORE_PACKAGE_FILES],
    packageManager: "pnpm@11.17.0",
  };
}

function changelog(version = "0.2.0") {
  return `# Changelog

## Unreleased

## ${version} - 2026-07-29

### Added

- Secure release automation.

## 0.1.0

- Initial release.
`;
}

function vscodePackageMetadata(version = "0.2.0") {
  return {
    name: "wikitext-formatter",
    displayName: "Wikitext Formatter",
    publisher: "skyeyefast",
    version,
    description: "Parser-assisted structural MediaWiki wikitext formatter",
    repository: {
      type: "git",
      url: VSCODE_REPOSITORY_URL,
      directory: VSCODE_REPOSITORY_DIRECTORY,
    },
    bugs: { url: VSCODE_BUGS_URL },
    homepage: VSCODE_HOMEPAGE,
    license: "GPL-3.0-or-later",
    pricing: "Free",
    categories: ["Formatters"],
    keywords: ["wikitext", "mediawiki", "formatter"],
    galleryBanner: { color: "#2f3340", theme: "dark" },
    icon: VSCODE_ICON,
    engines: { vscode: VSCODE_MINIMUM_ENGINE },
    type: "module",
    main: "./dist/extension.js",
  };
}

describe("core release metadata", () => {
  it("derives stable release metadata", () => {
    const metadata = prepareCoreRelease({
      tag: "core-v0.2.0",
      packageMetadata: packageMetadata(),
      changelog: changelog(),
      commit: "abc123",
    });
    expect(metadata).toMatchObject({
      expectedTag: "core-v0.2.0",
      prerelease: false,
      npmDistTag: "latest",
      githubReleaseTitle: "wikitext-fmt 0.2.0",
      tarballFilename: "wikitext-fmt-0.2.0.tgz",
      repository: "SkyEye-FAST/wikitext-fmt",
    });
    expect(metadata.releaseNotes).toContain("Secure release automation.");
  });

  it("selects next and GitHub prerelease status for SemVer prereleases", () => {
    const metadata = prepareCoreRelease({
      tag: "core-v0.3.0-beta.1",
      packageMetadata: packageMetadata("0.3.0-beta.1"),
      changelog: changelog("0.3.0-beta.1"),
    });
    expect(metadata.npmDistTag).toBe("next");
    expect(metadata.prerelease).toBe(true);
  });

  it.each([
    "v0.2.0",
    "0.2.0",
    "core-0.2.0",
    "vscode-v0.2.0",
    "core-vlatest",
  ])("rejects malformed or wrong-component tag %s", (tag) => {
    expect(() =>
      prepareCoreRelease({
        tag,
        packageMetadata: packageMetadata(),
        changelog: changelog(),
      }),
    ).toThrow();
  });

  it("rejects a package/tag mismatch", () => {
    expect(() =>
      prepareCoreRelease({
        tag: "core-v0.2.1",
        packageMetadata: packageMetadata(),
        changelog: changelog(),
      }),
    ).toThrow(/does not match package version/u);
  });

  it("rejects missing release notes and material in Unreleased", () => {
    expect(() =>
      prepareCoreRelease({
        tag: "core-v0.2.0",
        packageMetadata: packageMetadata(),
        changelog: "# Changelog\n\n## Unreleased\n\n- Not finalized.\n",
      }),
    ).toThrow(/current release/u);
    expect(() =>
      prepareCoreRelease({
        tag: "core-v0.2.0",
        packageMetadata: packageMetadata(),
        changelog:
          "# Changelog\n\n## Unreleased\n\n## 0.2.0 - 2026-07-29\n\n## 0.1.0\n\n- Initial.\n",
      }),
    ).toThrow(/release notes for 0\.2\.0 are empty/u);
    expect(() =>
      prepareCoreRelease({
        tag: "core-v0.2.0",
        packageMetadata: packageMetadata(),
        changelog: changelog().replace(
          "## Unreleased\n",
          "## Unreleased\n\n- Future work.\n",
        ),
      }),
    ).toThrow(/Unreleased section must be empty/u);
  });

  it("uses strict SemVer validation", () => {
    expect(isSemVer("0.3.0-beta.1")).toBe(true);
    expect(isSemVer("0.3.0-beta.01")).toBe(false);
    expect(isSemVer("01.3.0")).toBe(false);
  });
});

describe("VS Code release metadata", () => {
  it("derives stable extension release metadata", () => {
    const metadata = prepareVscodeRelease({
      tag: "vscode-v0.2.0",
      packageMetadata: vscodePackageMetadata(),
      changelog: changelog(),
      commit: "abc123",
      packageManager: "pnpm@11.17.0",
    });
    expect(metadata).toMatchObject({
      component: "vscode",
      extensionId: "skyeyefast.wikitext-formatter",
      expectedTag: "vscode-v0.2.0",
      prerelease: false,
      githubReleaseTitle: "Wikitext Formatter 0.2.0",
      vsixFilename: "wikitext-formatter-0.2.0.vsix",
      repository: "SkyEye-FAST/wikitext-fmt",
    });
    expect(metadata.releaseNotes).toContain("Secure release automation.");
  });

  it.each([
    "v0.2.0",
    "0.2.0",
    "vscode-0.2.0",
    "core-v0.2.0",
    "vscode-vlatest",
  ])("rejects malformed or wrong-component tag %s", (tag) => {
    expect(() =>
      prepareVscodeRelease({
        tag,
        packageMetadata: vscodePackageMetadata(),
        changelog: changelog(),
      }),
    ).toThrow();
  });

  it("rejects a tag mismatch, non-empty Unreleased, and incompatible ESM baseline", () => {
    expect(() =>
      prepareVscodeRelease({
        tag: "vscode-v0.2.1",
        packageMetadata: vscodePackageMetadata(),
        changelog: changelog(),
      }),
    ).toThrow(/does not match extension version/u);
    expect(() =>
      prepareVscodeRelease({
        tag: "vscode-v0.2.0",
        packageMetadata: vscodePackageMetadata(),
        changelog: changelog().replace(
          "## Unreleased\n",
          "## Unreleased\n\n- Future work.\n",
        ),
      }),
    ).toThrow(/Unreleased section must be empty/u);
    expect(() =>
      prepareVscodeRelease({
        tag: "vscode-v0.2.0",
        packageMetadata: {
          ...vscodePackageMetadata(),
          engines: { vscode: "^1.90.0" },
        },
        changelog: changelog(),
      }),
    ).toThrow(/engines\.vscode must be \^1\.100\.0/u);
  });
});

describe("published npm recovery", () => {
  const metadata = {
    packageName: "wikitext-fmt",
    version: "0.2.0",
    npmDistTag: "latest",
  };

  it("publishes when the exact version is absent", () => {
    expect(assessRegistryVersion({ versions: {} }, metadata, "abc")).toEqual({
      publishRequired: true,
    });
  });

  it("continues safely when the published version matches", () => {
    expect(
      assessRegistryVersion(
        {
          "dist-tags": { latest: "0.2.0" },
          versions: {
            "0.2.0": {
              name: "wikitext-fmt",
              version: "0.2.0",
              repository: { type: "git", url: CORE_REPOSITORY_URL },
              gitHead: "abc",
            },
          },
        },
        metadata,
        "abc",
      ),
    ).toEqual({ publishRequired: false });
  });

  it("fails closed when an existing version does not match", () => {
    expect(() =>
      assessRegistryVersion(
        {
          "dist-tags": { latest: "0.2.0" },
          versions: {
            "0.2.0": {
              name: "wikitext-fmt",
              version: "0.2.0",
              repository: { type: "git", url: CORE_REPOSITORY_URL },
              gitHead: "different",
            },
          },
        },
        metadata,
        "abc",
      ),
    ).toThrow(/does not match release commit/u);
  });
});

describe("GitHub Release recovery", () => {
  const metadata = {
    expectedTag: "core-v0.2.0",
    githubReleaseTitle: "wikitext-fmt 0.2.0",
    prerelease: false,
    releaseNotes: "### Added\n\n- Secure release automation.\n",
  };

  it("accepts a matching published release", () => {
    expect(
      validateExistingGithubRelease(
        {
          tagName: "core-v0.2.0",
          name: "wikitext-fmt 0.2.0",
          isDraft: false,
          isPrerelease: false,
          body: metadata.releaseNotes,
        },
        metadata,
      ),
    ).toEqual({ state: "published" });
  });

  it("allows a matching-tag draft to be repaired", () => {
    expect(
      validateExistingGithubRelease(
        {
          tagName: "core-v0.2.0",
          name: "incomplete",
          isDraft: true,
          isPrerelease: true,
          body: "",
        },
        metadata,
      ),
    ).toEqual({ state: "draft" });
  });

  it("rejects a conflicting published release", () => {
    expect(() =>
      validateExistingGithubRelease(
        {
          tagName: "core-v0.2.0",
          name: "conflicting title",
          isDraft: false,
          isPrerelease: false,
          body: metadata.releaseNotes,
        },
        metadata,
      ),
    ).toThrow(/title conflicts/u);
  });
});

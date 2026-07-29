import { describe, expect, it } from "vitest";

import {
  CORE_BUGS_URL,
  CORE_HOMEPAGE,
  CORE_PACKAGE_FILES,
  CORE_REGISTRY,
  CORE_REPOSITORY_URL,
  isSemVer,
  prepareCoreRelease,
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

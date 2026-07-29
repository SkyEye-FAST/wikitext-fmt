import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessRegistryVersion,
  computeTarballDigests,
  verifyPublishedVersionWithRetry,
} from "../scripts/check-npm-release.mjs";
import { CORE_REPOSITORY_URL } from "../scripts/release-metadata.mjs";

const metadata = {
  packageName: "wikitext-fmt",
  version: "0.2.0",
  npmDistTag: "latest",
};

const digests = {
  integrity: "sha512-verified",
  shasum: "verified-sha1",
};

function matchingPackument() {
  return {
    "dist-tags": { latest: "0.2.0" },
    versions: {
      "0.2.0": {
        name: "wikitext-fmt",
        version: "0.2.0",
        repository: { type: "git", url: CORE_REPOSITORY_URL },
        dist: { ...digests },
      },
    },
  };
}

function retryOptions(fetchPackument, overrides = {}) {
  return {
    fetchPackument,
    metadata,
    commit: "abc",
    tarballDigests: digests,
    attempts: 3,
    delay: async () => {},
    requireExisting: true,
    ...overrides,
  };
}

describe("npm release artifact recovery", () => {
  it("requires publication when the exact version is absent", async () => {
    await expect(
      verifyPublishedVersionWithRetry(
        retryOptions(async () => ({ versions: {} }), {
          requireExisting: false,
        }),
      ),
    ).resolves.toEqual({ publishRequired: true });
  });

  it("accepts a matching tarball when npm omits gitHead", () => {
    expect(
      assessRegistryVersion(matchingPackument(), metadata, "abc", digests),
    ).toEqual({ publishRequired: false });
  });

  it("accepts a matching gitHead when npm provides one", () => {
    const packument = matchingPackument();
    packument.versions["0.2.0"].gitHead = "abc";
    expect(
      assessRegistryVersion(packument, metadata, "abc", digests),
    ).toEqual({ publishRequired: false });
  });

  it("still rejects a conflicting gitHead when npm provides one", () => {
    const packument = matchingPackument();
    packument.versions["0.2.0"].gitHead = "different";
    expect(() =>
      assessRegistryVersion(packument, metadata, "abc", digests),
    ).toThrow(/does not match release commit/u);
  });

  it.each([
    ["integrity", "sha512-different", /integrity/u],
    ["shasum", "different-sha1", /shasum/u],
  ])("rejects a conflicting tarball %s", (field, value, message) => {
    const packument = matchingPackument();
    packument.versions["0.2.0"].dist[field] = value;
    expect(() =>
      assessRegistryVersion(packument, metadata, "abc", digests),
    ).toThrow(message);
  });

  it.each([
    [
      "package name",
      (packument) => {
        packument.versions["0.2.0"].name = "different";
      },
      /package identity/u,
    ],
    [
      "package version",
      (packument) => {
        packument.versions["0.2.0"].version = "0.1.0";
      },
      /package identity/u,
    ],
    [
      "repository",
      (packument) => {
        packument.versions["0.2.0"].repository.url =
          "git+https://github.com/example/different.git";
      },
      /repository/u,
    ],
    [
      "npm dist-tag",
      (packument) => {
        packument["dist-tags"].latest = "0.1.0";
      },
      /dist-tag/u,
    ],
  ])("rejects a conflicting %s", (_name, mutate, message) => {
    const packument = matchingPackument();
    mutate(packument);
    expect(() =>
      assessRegistryVersion(packument, metadata, "abc", digests),
    ).toThrow(message);
  });

  it("retries after publication while an absent version propagates", async () => {
    const packuments = [{ versions: {} }, matchingPackument()];
    let fetchCount = 0;
    let delayCount = 0;

    await expect(
      verifyPublishedVersionWithRetry(
        retryOptions(async () => packuments[fetchCount++], {
          delay: async () => {
            delayCount += 1;
          },
        }),
      ),
    ).resolves.toEqual({ publishRequired: false });
    expect(fetchCount).toBe(2);
    expect(delayCount).toBe(1);
  });

  it("retries incomplete or stale metadata until it matches", async () => {
    const stale = matchingPackument();
    stale.versions["0.2.0"].dist.integrity = "sha512-stale";
    const packuments = [stale, matchingPackument()];
    let fetchCount = 0;

    await expect(
      verifyPublishedVersionWithRetry(
        retryOptions(async () => packuments[fetchCount++]),
      ),
    ).resolves.toEqual({ publishRequired: false });
    expect(fetchCount).toBe(2);
  });

  it("throws the final meaningful error after persistent mismatch", async () => {
    let fetchCount = 0;
    const fetchPackument = async () => {
      fetchCount += 1;
      const packument = matchingPackument();
      if (fetchCount === 1) {
        packument.versions["0.2.0"].dist.integrity = "sha512-stale";
      } else if (fetchCount === 2) {
        packument.versions["0.2.0"].repository.url =
          "git+https://github.com/example/stale.git";
      } else {
        packument["dist-tags"].latest = "0.1.0";
      }
      return packument;
    };

    await expect(
      verifyPublishedVersionWithRetry(retryOptions(fetchPackument)),
    ).rejects.toThrow(/dist-tag latest does not point to 0\.2\.0/u);
    expect(fetchCount).toBe(3);
  });

  it("fails a pre-publication conflict immediately without retrying", async () => {
    let fetchCount = 0;
    let delayCount = 0;
    const fetchPackument = async () => {
      fetchCount += 1;
      const packument = matchingPackument();
      packument.versions["0.2.0"].repository.url =
        "git+https://github.com/example/different.git";
      return packument;
    };

    await expect(
      verifyPublishedVersionWithRetry(
        retryOptions(fetchPackument, {
          delay: async () => {
            delayCount += 1;
          },
          requireExisting: false,
        }),
      ),
    ).rejects.toThrow(/repository/u);
    expect(fetchCount).toBe(1);
    expect(delayCount).toBe(0);
  });

  it("computes npm-compatible hashes from the exact tarball bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wikitext-fmt-release-"));
    try {
      const tarballPath = join(directory, "wikitext-fmt-0.2.0.tgz");
      const tarball = Buffer.from("verified tarball bytes");
      await writeFile(tarballPath, tarball);
      await expect(computeTarballDigests(tarballPath)).resolves.toEqual({
        integrity: `sha512-${createHash("sha512")
          .update(tarball)
          .digest("base64")}`,
        shasum: createHash("sha1").update(tarball).digest("hex"),
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

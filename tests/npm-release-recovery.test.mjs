import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessRegistryVersion,
  computeTarballDigests,
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

describe("npm release artifact recovery", () => {
  it("accepts a matching tarball when npm omits gitHead", () => {
    expect(
      assessRegistryVersion(matchingPackument(), metadata, "abc", digests),
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

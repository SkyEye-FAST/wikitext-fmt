#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CORE_REPOSITORY_URL,
  assertRelease,
} from "./release-metadata.mjs";

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--require-existing") {
      options.requireExisting = true;
      continue;
    }
    const value = args[index + 1];
    assertRelease(
      name?.startsWith("--") && value !== undefined,
      "Usage: check-npm-release.mjs --metadata FILE [--tarball FILE] --commit SHA [--github-output FILE] [--require-existing]",
    );
    options[name.slice(2)] = value;
    index += 1;
  }
  assertRelease(options.metadata, "--metadata is required");
  assertRelease(options.commit, "--commit is required");
  if (options.attempts !== undefined) {
    assertRelease(
      /^[1-9]\d*$/u.test(options.attempts),
      "--attempts must be a positive integer",
    );
  }
  return options;
}

export async function computeTarballDigests(tarballPath) {
  const tarball = await readFile(resolve(tarballPath));
  return {
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    shasum: createHash("sha1").update(tarball).digest("hex"),
  };
}

export function assessRegistryVersion(
  packument,
  metadata,
  commit,
  tarballDigests,
) {
  const published = packument?.versions?.[metadata.version];
  if (!published) return { publishRequired: true };
  assertRelease(
    published.name === metadata.packageName &&
      published.version === metadata.version,
    `npm ${metadata.packageName}@${metadata.version} has conflicting package identity`,
  );
  assertRelease(
    published.repository?.type === "git" &&
      published.repository?.url === CORE_REPOSITORY_URL,
    `npm ${metadata.packageName}@${metadata.version} has a conflicting repository`,
  );
  if (tarballDigests) {
    assertRelease(
      published.dist?.integrity === tarballDigests.integrity,
      `npm ${metadata.packageName}@${metadata.version} tarball integrity does not match the verified release artifact`,
    );
    assertRelease(
      published.dist?.shasum === tarballDigests.shasum,
      `npm ${metadata.packageName}@${metadata.version} tarball shasum does not match the verified release artifact`,
    );
    if (published.gitHead !== undefined && published.gitHead !== null) {
      assertRelease(
        published.gitHead === commit,
        `npm ${metadata.packageName}@${metadata.version} gitHead ${published.gitHead} does not match release commit ${commit}`,
      );
    }
  } else {
    assertRelease(
      published.gitHead === commit,
      `npm ${metadata.packageName}@${metadata.version} gitHead ${published.gitHead ?? "(missing)"} does not match release commit ${commit}`,
    );
  }
  assertRelease(
    packument["dist-tags"]?.[metadata.npmDistTag] === metadata.version,
    `npm dist-tag ${metadata.npmDistTag} does not point to ${metadata.version}`,
  );
  return { publishRequired: false };
}

async function fetchPackument(metadata) {
  const url = new URL(encodeURIComponent(metadata.packageName), metadata.registry);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) return { versions: {} };
  assertRelease(
    response.ok,
    `npm registry query failed with HTTP ${response.status}`,
  );
  return response.json();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const metadataPath = resolve(options.metadata);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assertRelease(
    options.tarball || metadata.tarballFilename,
    "--tarball is required when release metadata has no tarballFilename",
  );
  const tarballPath = options.tarball
    ? resolve(options.tarball)
    : resolve(dirname(metadataPath), metadata.tarballFilename);
  const tarballDigests = await computeTarballDigests(tarballPath);
  const attempts = Number(options.attempts ?? 1);
  let state;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    state = assessRegistryVersion(
      await fetchPackument(metadata),
      metadata,
      options.commit,
      tarballDigests,
    );
    if (!options.requireExisting || !state.publishRequired) break;
    if (attempt < attempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
    }
  }
  if (options.requireExisting) {
    assertRelease(
      !state.publishRequired,
      `npm ${metadata.packageName}@${metadata.version} is still unavailable after publication`,
    );
  }
  if (options["github-output"]) {
    await appendFile(
      options["github-output"],
      `publish_required=${state.publishRequired}\n`,
    );
  }
  console.log(
    state.publishRequired
      ? `npm ${metadata.packageName}@${metadata.version} is not published`
      : `npm ${metadata.packageName}@${metadata.version} matches the verified release artifact`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertRelease } from "./release-metadata.mjs";

function normalizedMarkdown(value) {
  return `${value.replace(/\r\n/gu, "\n").trim()}\n`;
}

export function validateExistingGithubRelease(release, metadata) {
  assertRelease(
    release.tagName === metadata.expectedTag,
    `GitHub Release tag ${release.tagName} conflicts with ${metadata.expectedTag}`,
  );
  if (release.isDraft) return { state: "draft" };
  assertRelease(
    release.name === metadata.githubReleaseTitle,
    `published GitHub Release title conflicts with ${metadata.githubReleaseTitle}`,
  );
  assertRelease(
    release.isPrerelease === metadata.prerelease,
    "published GitHub Release prerelease status conflicts with SemVer",
  );
  assertRelease(
    normalizedMarkdown(release.body) === normalizedMarkdown(metadata.releaseNotes),
    "published GitHub Release body conflicts with the changelog release notes",
  );
  return { state: "published" };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    assertRelease(
      name?.startsWith("--") && value !== undefined,
      "Usage: check-github-release.mjs --metadata FILE --release FILE [--github-output FILE]",
    );
    options[name.slice(2)] = value;
  }
  assertRelease(options.metadata, "--metadata is required");
  assertRelease(options.release, "--release is required");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const metadata = JSON.parse(
    await readFile(resolve(options.metadata), "utf8"),
  );
  const release = JSON.parse(await readFile(resolve(options.release), "utf8"));
  const result = validateExistingGithubRelease(release, metadata);
  if (options["github-output"]) {
    await appendFile(options["github-output"], `release_state=${result.state}\n`);
  }
  console.log(`existing GitHub Release is a matching ${result.state}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertRelease, prepareCoreRelease } from "./release-metadata.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(args) {
  if (args[0] === "--") args = args.slice(1);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    assertRelease(
      name?.startsWith("--") && value !== undefined,
      "Usage: prepare-release.mjs --component core --tag core-vX.Y.Z [--commit SHA] [--output-dir DIR] [--github-output FILE]",
    );
    options[name.slice(2)] = value;
  }
  assertRelease(
    options.component === "core",
    "prepare-release.mjs currently supports only --component core",
  );
  assertRelease(options.tag, "--tag is required");
  return options;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8"));
}

const options = parseArguments(process.argv.slice(2));
const metadata = prepareCoreRelease({
  tag: options.tag,
  packageMetadata: await readJson("package.json"),
  changelog: await readFile(resolve(repositoryRoot, "CHANGELOG.md"), "utf8"),
  commit: options.commit,
});

if (options["output-dir"]) {
  const outputDirectory = resolve(repositoryRoot, options["output-dir"]);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    resolve(outputDirectory, "release-metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  await writeFile(
    resolve(outputDirectory, "release-notes.md"),
    metadata.releaseNotes,
  );
}

if (options["github-output"]) {
  const output = [
    `package_name=${metadata.packageName}`,
    `version=${metadata.version}`,
    `tag=${metadata.expectedTag}`,
    `prerelease=${metadata.prerelease}`,
    `npm_dist_tag=${metadata.npmDistTag}`,
    `release_title=${metadata.githubReleaseTitle}`,
    `tarball_filename=${metadata.tarballFilename}`,
    `repository=${metadata.repository}`,
    `package_manager=${metadata.packageManager}`,
  ].join("\n");
  await appendFile(options["github-output"], `${output}\n`);
}

console.log(JSON.stringify(metadata, null, 2));

#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  ".vscode-test",
  "dist",
  "dist-test",
  "node_modules",
]);
const requiredDocs = [
  "README.md",
  "getting-started.md",
  "cli.md",
  "configuration.md",
  "api.md",
  "safety-and-diagnostics.md",
  "rules.md",
  "localization.md",
  "corpus-and-benchmarks.md",
  "development.md",
  "versioning.md",
  "releasing.md",
];
const movedDocumentationNames = [
  `VERSION${"ING.md"}`,
  `RELEASE_${"CHECKLIST.md"}`,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function filesUnder(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await filesUnder(path)));
    else results.push(path);
  }
  return results;
}

function markdownDestinations(contents) {
  return [...contents.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)].map(
    (match) => match[1],
  );
}

function localDestination(rawDestination) {
  let destination = rawDestination.trim();
  if (destination.startsWith("<") && destination.endsWith(">"))
    destination = destination.slice(1, -1);
  else destination = destination.split(/\s+/u)[0] ?? "";
  if (
    destination === "" ||
    destination.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(destination)
  ) {
    return undefined;
  }
  const withoutFragment = destination.split("#", 1)[0]?.split("?", 1)[0];
  return withoutFragment ? decodeURIComponent(withoutFragment) : undefined;
}

const allFiles = await filesUnder(repositoryRoot);
const markdownFiles = allFiles.filter((path) => extname(path) === ".md");
for (const path of markdownFiles) {
  const contents = await readFile(path, "utf8");
  for (const destination of markdownDestinations(contents)) {
    const local = localDestination(destination);
    if (!local) continue;
    const target = resolve(dirname(path), local);
    assert(
      await exists(target),
      `${path.slice(repositoryRoot.length + 1)} links to missing ${destination}`,
    );
  }
}

for (const doc of requiredDocs) {
  assert(await exists(resolve(repositoryRoot, "docs", doc)), `Missing docs/${doc}`);
}

const rootReadme = await readFile(resolve(repositoryRoot, "README.md"), "utf8");
for (const doc of requiredDocs) {
  assert(
    rootReadme.includes(`docs/${doc}`),
    `README.md must link to docs/${doc}`,
  );
}

const [{ optionSchema }, { ruleLevels }] = await Promise.all([
  import("../dist/options/schema.js"),
  import("../dist/rules/index.js"),
]);
const configuration = await readFile(
  resolve(repositoryRoot, "docs/configuration.md"),
  "utf8",
);
for (const entry of optionSchema) {
  assert(
    configuration.includes(`| \`${entry.name}\` |`),
    `docs/configuration.md is missing option ${entry.name}`,
  );
}

const rules = await readFile(resolve(repositoryRoot, "docs/rules.md"), "utf8");
for (const rule of Object.keys(ruleLevels)) {
  assert(
    rules.includes(`| \`${rule}\` |`),
    `docs/rules.md is missing rule ${rule}`,
  );
}

const extensionPackage = JSON.parse(
  await readFile(resolve(repositoryRoot, "packages/vscode/package.json"), "utf8"),
);
const extensionReadme = await readFile(
  resolve(repositoryRoot, "packages/vscode/README.md"),
  "utf8",
);
for (const key of Object.keys(
  extensionPackage.contributes.configuration.properties,
)) {
  assert(
    extensionReadme.includes(`| \`${key}\` |`),
    `packages/vscode/README.md is missing setting ${key}`,
  );
}

const textExtensions = new Set([".json", ".md", ".mjs", ".ts", ".yaml", ".yml"]);
for (const path of allFiles.filter((file) => textExtensions.has(extname(file)))) {
  const contents = await readFile(path, "utf8");
  assert(
    movedDocumentationNames.every((name) => !contents.includes(name)),
    `${path.slice(repositoryRoot.length + 1)} references a moved documentation path`,
  );
}

const rootPackage = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
);
assert(rootPackage.files.includes("docs"), "package.json files must include docs");
assert(
  movedDocumentationNames.every((name) => !rootPackage.files.includes(name)),
  "package.json files contains a moved documentation path",
);

const packagedRootFiles = new Set(["README.md", "CHANGELOG.md", "LICENSE"]);
const packagedMarkdown = markdownFiles.filter((path) => {
  const relative = path.slice(repositoryRoot.length + 1);
  return relative.startsWith("docs/") || packagedRootFiles.has(relative);
});
for (const path of packagedMarkdown) {
  const contents = await readFile(path, "utf8");
  for (const destination of markdownDestinations(contents)) {
    const local = localDestination(destination);
    if (!local) continue;
    const target = resolve(dirname(path), local);
    const relative = target.slice(repositoryRoot.length + 1);
    assert(
      relative.startsWith("docs/") || packagedRootFiles.has(relative),
      `${path.slice(repositoryRoot.length + 1)} has unpackaged relative link ${destination}`,
    );
  }
}

console.log(
  `documentation metadata ok (${markdownFiles.length} Markdown files, ${optionSchema.length} options, ${Object.keys(ruleLevels).length} rules)`,
);

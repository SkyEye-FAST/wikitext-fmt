import { PackageManager, listFiles } from "@vscode/vsce";

const files = await listFiles({ packageManager: PackageManager.None });

const required = [
  "dist/extension.js",
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "dist/node_modules/wikiparser-node/package.json",
  "dist/node_modules/wikiparser-node/config/default.json",
];
const forbiddenFiles = ["tsconfig.json"];
const forbiddenPatterns = [
  /^src\//u,
  /^tests\//u,
  /^test\//u,
  /^scripts\//u,
  /^dist-test\//u,
  /^fixtures\//u,
  /^tsconfig.*\.json$/u,
  /^vitest\.config\./u,
  /\.vsix$/u,
];

const missing = required.filter((file) => !files.includes(file));
const includedForbiddenFiles = forbiddenFiles.filter((file) =>
  files.includes(file),
);
const includedForbiddenPatterns = files.filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)),
);
const includedForbidden = [
  ...includedForbiddenFiles,
  ...includedForbiddenPatterns,
];
const wikiparserConfigFiles = files.filter((file) =>
  /^dist\/node_modules\/wikiparser-node\/config\/.+\.json$/.test(file),
);

if (
  missing.length > 0 ||
  includedForbidden.length > 0 ||
  wikiparserConfigFiles.length < 2
) {
  if (missing.length > 0) {
    console.error(`Missing expected VSIX files: ${missing.join(", ")}`);
  }
  if (includedForbidden.length > 0) {
    console.error(
      `Unexpected development files in VSIX: ${includedForbidden.join(", ")}`,
    );
  }
  if (wikiparserConfigFiles.length < 2) {
    console.error(
      `Expected multiple wikiparser-node config JSON files, found ${wikiparserConfigFiles.length}`,
    );
  }
  process.exit(1);
}

console.log("VSIX content smoke ok");

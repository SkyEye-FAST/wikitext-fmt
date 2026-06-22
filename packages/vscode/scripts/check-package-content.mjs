import { PackageManager, listFiles } from "@vscode/vsce";

const files = await listFiles({ packageManager: PackageManager.None });

const required = [
  "dist/extension.js",
  "package.json",
  "README.md",
  "LICENSE",
  "dist/node_modules/wikiparser-node/package.json",
  "dist/node_modules/wikiparser-node/config/default.json",
];
const forbidden = [
  "src/extension.ts",
  "src/format.ts",
  "tests/format.test.ts",
  "test/runTest.ts",
  "scripts/build.mjs",
  "tsconfig.json",
];

const missing = required.filter((file) => !files.includes(file));
const includedForbidden = forbidden.filter((file) => files.includes(file));
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

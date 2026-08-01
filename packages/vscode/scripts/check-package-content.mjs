import { PackageManager, listFiles } from "@vscode/vsce";
import { readFile } from "node:fs/promises";

const files = await listFiles({ packageManager: PackageManager.None });
const icon = await readFile(new URL("../images/icon.png", import.meta.url));
const validIcon =
  icon.length >= 24 &&
  icon.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  ) &&
  icon.readUInt32BE(16) === 256 &&
  icon.readUInt32BE(20) === 256;

const required = [
  "dist/extension.js",
  "package.json",
  "package.nls.json",
  "package.nls.zh-cn.json",
  "package.nls.zh-tw.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "images/icon.png",
  "l10n/bundle.l10n.json",
  "l10n/bundle.l10n.zh-cn.json",
  "l10n/bundle.l10n.zh-tw.json",
  "dist/node_modules/wikiparser-node/package.json",
  "dist/node_modules/wikiparser-node/config/default.json",
];
const forbiddenFiles = ["tsconfig.json"];
const forbiddenPatterns = [
  /^docs\//u,
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
  wikiparserConfigFiles.length < 2 ||
  !validIcon
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
  if (!validIcon) {
    console.error("Expected images/icon.png to be a valid 256x256 PNG");
  }
  process.exit(1);
}

console.log("VSIX content smoke ok");

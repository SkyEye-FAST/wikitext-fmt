import { PackageManager, listFiles } from "@vscode/vsce";

const files = await listFiles({ packageManager: PackageManager.None });

const required = ["dist/extension.js", "package.json", "README.md", "LICENSE"];
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

if (missing.length > 0 || includedForbidden.length > 0) {
  if (missing.length > 0) {
    console.error(`Missing expected VSIX files: ${missing.join(", ")}`);
  }
  if (includedForbidden.length > 0) {
    console.error(
      `Unexpected development files in VSIX: ${includedForbidden.join(", ")}`,
    );
  }
  process.exit(1);
}

console.log("VSIX content smoke ok");

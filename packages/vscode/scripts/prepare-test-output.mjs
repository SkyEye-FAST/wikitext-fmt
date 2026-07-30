import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "dist-test/test");

await mkdir(outputDirectory, { recursive: true });
await copyFile(
  resolve(packageRoot, "test/package.json"),
  resolve(outputDirectory, "package.json"),
);

import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await rm(resolve(packageRoot, "dist"), { force: true, recursive: true });
await mkdir(resolve(packageRoot, "dist"), { recursive: true });

await build({
  banner: {
    js: [
      'import { dirname as __wikitextFmtDirname } from "node:path";',
      'import { fileURLToPath as __wikitextFmtFileURLToPath } from "node:url";',
      'import { createRequire as __wikitextFmtCreateRequire } from "node:module";',
      "const __filename = __wikitextFmtFileURLToPath(import.meta.url);",
      "const __dirname = __wikitextFmtDirname(__filename);",
      "const require = __wikitextFmtCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  bundle: true,
  entryPoints: [resolve(packageRoot, "src/extension.ts")],
  external: ["vscode", "node:*", "inspector/promises"],
  format: "esm",
  legalComments: "none",
  logLevel: "info",
  outfile: resolve(packageRoot, "dist/extension.js"),
  platform: "node",
  sourcemap: false,
  target: "node20",
});

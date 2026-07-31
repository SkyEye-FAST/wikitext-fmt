import { build } from "../packages/vscode/node_modules/esbuild/lib/main.js";

const forbiddenInputs = [
  "node:fs",
  "node:module",
  "node:path",
  "node:url",
  "fast-glob",
  "/src/cli",
  "/src/config",
  "/packages/vscode",
];

const result = await build({
  stdin: {
    contents: `
      import { formatWikitextSafe } from "wikitext-fmt/browser";

      self.onmessage = (event) => {
        self.postMessage(formatWikitextSafe(event.data));
      };
    `,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "wikitext-fmt-browser-worker.ts",
  },
  bundle: true,
  format: "esm",
  logLevel: "silent",
  metafile: true,
  platform: "browser",
  write: false,
});

const inputs = Object.keys(result.metafile.inputs).map((input) =>
  input.replaceAll("\\", "/"),
);
const output = result.outputFiles.map((file) => file.text).join("\n");
const violations = forbiddenInputs.filter(
  (forbidden) =>
    inputs.some((input) => input.includes(forbidden)) ||
    output.includes(forbidden),
);

if (violations.length > 0) {
  throw new Error(
    `Browser bundle contains forbidden dependencies: ${violations.join(", ")}`,
  );
}

if (!inputs.some((input) => input.endsWith("dist/browser.js"))) {
  throw new Error("Browser bundle did not resolve wikitext-fmt/browser");
}

console.log(
  `Browser bundle verified: ${inputs.length} inputs, ${result.outputFiles[0].contents.length} bytes.`,
);

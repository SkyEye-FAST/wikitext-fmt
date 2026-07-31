import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

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
        self.postMessage(
          formatWikitextSafe(event.data.source, event.data.options),
        );
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

async function verifyWorkerExecution(bundle) {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), "wikitext-fmt-browser-worker-"),
  );
  const filename = join(temporaryRoot, "worker-smoke.mjs");
  const harness = `
    import { parentPort } from "node:worker_threads";
    globalThis.self = globalThis;
    const previousParser = { sentinel: true };
    Object.defineProperty(globalThis, "Parser", {
      configurable: true,
      value: previousParser,
      writable: true,
    });
    globalThis.process = undefined;
    globalThis.Buffer = undefined;
    globalThis.postMessage = (value) => parentPort.postMessage(value);
    parentPort.on("message", ({ action, data }) => {
      if (action === "replace") {
        globalThis.Parser = { parse: () => { throw new Error("replacement used"); } };
      } else if (action === "delete") {
        Reflect.deleteProperty(globalThis, "Parser");
      }
      globalThis.onmessage({ data });
    });
    ${bundle}
    parentPort.postMessage({
      ready: true,
      restoredParser: globalThis.Parser === previousParser,
    });
  `;
  await writeFile(filename, harness);
  const worker = new Worker(pathToFileURL(filename));
  try {
    const results = await new Promise((resolve, reject) => {
      const received = [];
      const timer = setTimeout(
        () => reject(new Error("Browser Worker smoke test timed out")),
        10_000,
      );
      worker.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.on("message", (message) => {
        if (message?.ready) {
          if (!message.restoredParser) {
            clearTimeout(timer);
            reject(new Error("Browser adapter did not restore globalThis.Parser"));
            return;
          }
          worker.postMessage({
            action: "replace",
            data: { source: "==Title==\n" },
          });
          return;
        }
        received.push(message);
        if (received.length === 1) {
          worker.postMessage({
            action: "delete",
            data: {
              options: { parserConfig: "enwiki" },
              source: "==Title==\n",
            },
          });
          return;
        }
        clearTimeout(timer);
        resolve(received);
      });
    });
    if (
      JSON.stringify(results[0]) !==
      JSON.stringify({ formatted: "== Title ==\n" })
    ) {
      throw new Error(
        `Browser Worker smoke test returned an unexpected result: ${JSON.stringify(results[0])}`,
      );
    }
    if (
      results[1]?.formatted !== "==Title==\n" ||
      results[1]?.failure?.code !== "unsupported-parser-config" ||
      results[1]?.failure?.stage !== "parser-config"
    ) {
      throw new Error(
        `Browser Worker unsupported-config smoke test returned an unexpected result: ${JSON.stringify(results[1])}`,
      );
    }
  } finally {
    await worker.terminate();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await verifyWorkerExecution(output);

console.log(
  `Browser bundle and Worker execution verified: ${inputs.length} inputs, ${result.outputFiles[0].contents.length} raw bytes, ${gzipSync(result.outputFiles[0].contents).length} gzip bytes.`,
);

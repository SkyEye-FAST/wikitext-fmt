#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { gzipSync } from "node:zlib";

import { build } from "esbuild";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const typescriptCli = require.resolve("typescript/bin/tsc");
const forbiddenBrowserContent = [
  "node:fs",
  "node:module",
  "node:path",
  "node:url",
  "fast-glob",
  "/dist/cli",
  "/dist/config.",
  "/dist/config/",
  "/packages/vscode",
  "/src/",
  repositoryRoot.replaceAll("\\", "/"),
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`,
    );
  }
  return result;
}

function parseTarballArgument() {
  const tarballIndex = process.argv.indexOf("--tarball");
  if (tarballIndex === -1) return undefined;
  const tarball = process.argv[tarballIndex + 1];
  if (!tarball) throw new Error("--tarball requires a path");
  return resolve(repositoryRoot, tarball);
}

async function createTarball(directory) {
  const result = run(
    "pnpm",
    ["pack", "--pack-destination", directory, "--json"],
    { cwd: repositoryRoot },
  );
  const metadata = JSON.parse(result.stdout);
  const packResult = Array.isArray(metadata) ? metadata[0] : metadata;
  if (typeof packResult?.filename !== "string") {
    throw new Error("pnpm pack --json did not report a tarball filename");
  }
  return resolve(repositoryRoot, packResult.filename);
}

async function writeConsumerFixtures(consumerRoot) {
  await writeFile(
    join(consumerRoot, "package.json"),
    '{"name":"wikitext-fmt-browser-consumer","private":true,"type":"module"}\n',
  );
  await writeFile(
    join(consumerRoot, "consumer.ts"),
    `
      import {
        formatWikitextSafe,
        formatWikitextSafeDetailed,
        defaultOptions,
        ruleLevels,
      } from "wikitext-fmt/browser";
      import type {
        FormatOptions,
        FormatResult,
        FormatDetailedResult,
        FormatFailureCode,
      } from "wikitext-fmt/browser";
      const options: FormatOptions = { parserConfig: defaultOptions.parserConfig };
      const compact: FormatResult = formatWikitextSafe("==Title==\\n", options);
      const detailed: FormatDetailedResult = formatWikitextSafeDetailed(
        "==Title==\\n",
        options,
      );
      const code: FormatFailureCode | undefined = detailed.failure?.code;
      const level = ruleLevels.tables;
      void [compact, detailed, code, level];
    `,
  );
  await writeFile(
    join(consumerRoot, "worker.ts"),
    `
      import { formatWikitextSafe } from "wikitext-fmt/browser";
      import type { FormatOptions } from "wikitext-fmt/browser";

      interface Request {
        source: string;
        options?: FormatOptions;
      }

      self.onmessage = (event: MessageEvent<Request>) => {
        self.postMessage(
          formatWikitextSafe(event.data.source, event.data.options),
        );
      };
    `,
  );
  await writeFile(
    join(consumerRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "DOM", "WebWorker"],
          module: "ESNext",
          moduleResolution: "Bundler",
          noEmit: true,
          skipDefaultLibCheck: true,
          strict: true,
          target: "ES2022",
          types: [],
        },
        files: ["consumer.ts", "worker.ts"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumerRoot, "api-check.mjs"),
    `
      import * as browser from "wikitext-fmt/browser";
      import * as node from "wikitext-fmt";
      for (const name of [
        "formatWikitextSafe",
        "formatWikitextSafeDetailed",
        "defaultOptions",
        "ruleLevels",
      ]) {
        if (browser[name] === undefined || node[name] === undefined) {
          throw new Error(\`missing shared runtime export: \${name}\`);
        }
      }
      for (const name of [
        "CONFIG_FILENAMES",
        "discoverConfig",
        "loadConfig",
        "validateConfig",
        "verifyStructuralEquivalence",
      ]) {
        if (name in browser) {
          throw new Error(\`Node-only export leaked from browser entry: \${name}\`);
        }
      }
      if (typeof node.loadConfig !== "function") {
        throw new Error("Node package root did not expose loadConfig");
      }
      if (typeof node.verifyStructuralEquivalence !== "function") {
        throw new Error("Node package root did not expose structural equivalence");
      }
    `,
  );
}

async function validateInstalledPackage(consumerRoot) {
  const packageRoot = join(consumerRoot, "node_modules/wikitext-fmt");
  const packageMetadata = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(packageMetadata.exports).sort(), [
    ".",
    "./browser",
  ]);
  assert.deepEqual(packageMetadata.exports["./browser"], {
    types: "./dist/browser.d.ts",
    import: "./dist/browser.js",
  });
  const [rootDeclaration, browserDeclaration, publicDeclaration] =
    await Promise.all([
      readFile(join(packageRoot, "dist/index.d.ts"), "utf8"),
      readFile(join(packageRoot, "dist/browser.d.ts"), "utf8"),
      readFile(join(packageRoot, "dist/public.d.ts"), "utf8"),
    ]);
  assert.match(rootDeclaration, /export \* from "\.\/public\.js"/u);
  assert.match(browserDeclaration, /export \* from "\.\/public\.js"/u);
  for (const typeName of [
    "FormatOptions",
    "FormatResult",
    "FormatDetailedResult",
    "FormatFailureCode",
  ]) {
    assert.match(publicDeclaration, new RegExp(`\\b${typeName}\\b`, "u"));
  }

  run(process.execPath, [join(consumerRoot, "api-check.mjs")], {
    cwd: consumerRoot,
  });
  run(process.execPath, [typescriptCli, "-p", "tsconfig.json"], {
    cwd: consumerRoot,
  });
  const declarationFiles = run(
    process.execPath,
    [typescriptCli, "-p", "tsconfig.json", "--listFilesOnly"],
    { cwd: consumerRoot },
  ).stdout.replaceAll("\\", "/");
  const forbiddenDeclarationPaths = [
    "/@types/node/",
    "/fast-glob@",
    "/wikiparser-node@",
    "/wikitext-fmt/dist/config.d.ts",
    "/wikitext-fmt/dist/equivalenceEngine.d.ts",
    "/wikitext-fmt/dist/formatterEngine.d.ts",
    "/wikitext-fmt/dist/parserRuntime.d.ts",
  ].filter((path) => declarationFiles.includes(path));
  if (forbiddenDeclarationPaths.length > 0) {
    throw new Error(
      `Browser declarations reached Node-owned types: ${forbiddenDeclarationPaths.join(", ")}`,
    );
  }

  return realpath(packageRoot);
}

function validateBundleGraph(result, consumerRoot, installedPackageRoot) {
  const normalizedInputs = Object.keys(result.metafile.inputs).map((input) =>
    resolve(consumerRoot, input).replaceAll("\\", "/"),
  );
  const normalizedInstalledRoot = installedPackageRoot.replaceAll("\\", "/");
  const browserEntry = normalizedInputs.find((input) =>
    input.endsWith("/wikitext-fmt/dist/browser.js"),
  );
  if (!browserEntry || !browserEntry.startsWith(normalizedInstalledRoot)) {
    throw new Error(
      "Browser bundle did not resolve wikitext-fmt/browser from the standalone installation",
    );
  }

  const output = result.outputFiles.map((file) => file.text).join("\n");
  const inspected = `${JSON.stringify(result.metafile)}\n${output}`.replaceAll(
    "\\",
    "/",
  );
  const violations = forbiddenBrowserContent.filter((forbidden) =>
    inspected.includes(forbidden),
  );
  if (violations.length > 0) {
    throw new Error(
      `Packed browser bundle contains forbidden content: ${violations.join(", ")}`,
    );
  }
  const externalImports = Object.values(result.metafile.outputs).flatMap(
    (outputMetadata) =>
      outputMetadata.imports.filter((imported) => imported.external),
  );
  if (externalImports.length > 0) {
    throw new Error(
      `Packed browser bundle contains external imports: ${externalImports
        .map((imported) => imported.path)
        .join(", ")}`,
    );
  }
  return output;
}

async function verifyWorkerExecution(bundle, temporaryRoot) {
  const filename = join(temporaryRoot, "installed-browser-worker.mjs");
  await writeFile(
    filename,
    `
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
    `,
  );

  const worker = new Worker(pathToFileURL(filename));
  try {
    const results = await new Promise((resolvePromise, reject) => {
      const received = [];
      const timer = setTimeout(
        () => reject(new Error("Packed browser Worker smoke test timed out")),
        15_000,
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
        resolvePromise(received);
      });
    });
    assert.deepEqual(results[0], { formatted: "== Title ==\n" });
    assert.equal(results[1]?.formatted, "==Title==\n");
    assert.equal(results[1]?.failure?.code, "unsupported-parser-config");
    assert.equal(results[1]?.failure?.stage, "parser-config");
  } finally {
    await worker.terminate();
  }
}

const temporaryRoot = await mkdtemp(
  join(tmpdir(), "wikitext-fmt-browser-consumer-"),
);
try {
  const consumerRoot = join(temporaryRoot, "consumer");
  const packRoot = join(temporaryRoot, "package");
  await mkdir(consumerRoot, { recursive: true });
  await mkdir(packRoot, { recursive: true });
  await writeConsumerFixtures(consumerRoot);

  const tarball = parseTarballArgument() ?? (await createTarball(packRoot));
  run(
    "pnpm",
    ["--dir", consumerRoot, "add", "--ignore-workspace", tarball],
    { cwd: consumerRoot },
  );
  const installedPackageRoot = await validateInstalledPackage(consumerRoot);

  const result = await build({
    absWorkingDir: consumerRoot,
    bundle: true,
    format: "esm",
    logLevel: "silent",
    metafile: true,
    platform: "browser",
    stdin: {
      contents: await readFile(join(consumerRoot, "worker.ts"), "utf8"),
      loader: "ts",
      resolveDir: consumerRoot,
      sourcefile: "wikitext-fmt-browser-consumer-worker.ts",
    },
    target: "es2022",
    write: false,
  });
  const bundle = validateBundleGraph(
    result,
    consumerRoot,
    installedPackageRoot,
  );
  await verifyWorkerExecution(bundle, temporaryRoot);

  const bytes = result.outputFiles[0]?.contents;
  if (!bytes) throw new Error("Packed browser bundle was not emitted");
  console.log(
    `Packed browser consumer verified: ${Object.keys(result.metafile.inputs).length} inputs, ${bytes.length} raw bytes, ${gzipSync(bytes).length} gzip bytes.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

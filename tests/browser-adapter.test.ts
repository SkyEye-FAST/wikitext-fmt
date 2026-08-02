import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

import { build, type Plugin } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let temporaryRoot: string;
let workerFilename: string;

const instrumentBrowserParser: Plugin = {
  name: "instrument-browser-parser",
  setup(buildContext) {
    buildContext.onLoad(
      { filter: /bundle-lsp\.min\.js$/ },
      async ({ path }) => {
        const contents = await readFile(path, "utf8");
        return {
          contents: `${contents}
            const parser = globalThis.Parser;
            const originalParse = parser.parse.bind(parser);
            const stats = globalThis.__wikitextFmtBrowserStats ?? {
              moduleEvaluations: 0,
              parseCalls: 0,
              configExtractions: 0,
            };
            stats.moduleEvaluations += 1;
            parser.parse = (source, ...args) => {
              stats.parseCalls += 1;
              if (source === "") stats.configExtractions += 1;
              return originalParse(source, ...args);
            };
            globalThis.__wikitextFmtBrowserStats = stats;
          `,
          loader: "js",
          resolveDir: dirname(path),
        };
      },
    );
  },
};

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), "wikitext-fmt-browser-adapter-"));
  workerFilename = join(temporaryRoot, "browser-adapter-worker.mjs");

  const result = await build({
    stdin: {
      contents: `
        import {
          formatWikitextSafe,
          formatWikitextSafeDetailed,
        } from ${JSON.stringify(resolve(repositoryRoot, "src/browser.ts"))};
        globalThis.__wikitextFmtBrowserApi = {
          formatWikitextSafe,
          formatWikitextSafeDetailed,
        };
      `,
      loader: "ts",
      resolveDir: repositoryRoot,
      sourcefile: "browser-adapter-entry.ts",
    },
    bundle: true,
    format: "esm",
    logLevel: "silent",
    plugins: [instrumentBrowserParser],
    platform: "browser",
    target: "es2022",
    write: false,
  });
  const bundle = result.outputFiles[0]?.text;
  if (!bundle) throw new Error("Browser adapter test bundle was not emitted");

  await writeFile(
    workerFilename,
    `
      import { parentPort, workerData } from "node:worker_threads";
      globalThis.self = globalThis;
      const previousParser = { sentinel: true };
      if (workerData.preexisting) {
        Object.defineProperty(globalThis, "Parser", {
          configurable: true,
          enumerable: false,
          value: previousParser,
          writable: true,
        });
      }
      ${bundle}
      const api = globalThis.__wikitextFmtBrowserApi;
      const stats = globalThis.__wikitextFmtBrowserStats;
      const initialized = {
        configExtractions: stats.configExtractions,
        moduleEvaluations: stats.moduleEvaluations,
        parseCalls: stats.parseCalls,
        parserIsOwn: Object.hasOwn(globalThis, "Parser"),
      };
      let result;
      if (workerData.scenario === "multiple") {
        const first = api.formatWikitextSafe("==Title==\\n");
        const second = api.formatWikitextSafe("==Second==\\n");
        result = { first, second, initialized, stats: { ...stats } };
      } else if (workerData.scenario === "replace") {
        globalThis.Parser = { parse: () => { throw new Error("replacement used"); } };
        result = api.formatWikitextSafe("==Title==\\n");
      } else if (workerData.scenario === "delete") {
        Reflect.deleteProperty(globalThis, "Parser");
        result = api.formatWikitextSafe("==Title==\\n");
      } else if (workerData.scenario === "restore") {
        const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Parser");
        result = {
          configurable: descriptor?.configurable,
          enumerable: descriptor?.enumerable,
          restored: globalThis.Parser === previousParser,
          writable: descriptor?.writable,
        };
      } else if (workerData.scenario === "unsupported") {
        result = api.formatWikitextSafeDetailed("==Title==\\n", {
          parserConfig: "enwiki",
        });
      } else {
        throw new Error(\`Unknown scenario: \${workerData.scenario}\`);
      }
      parentPort.postMessage(result);
    `,
  );
}, 30_000);

afterAll(async () => {
  if (temporaryRoot) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function runWorkerScenario(
  scenario: string,
  preexisting = false,
): Promise<unknown> {
  const worker = new Worker(pathToFileURL(workerFilename), {
    workerData: { preexisting, scenario },
  });
  try {
    return await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Browser adapter Worker test timed out")),
        15_000,
      );
      worker.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.once("message", (message) => {
        clearTimeout(timer);
        resolvePromise(message);
      });
    });
  } finally {
    await worker.terminate();
  }
}

describe("browser parser adapter initialization", () => {
  it("captures the parser without querying its minimal configuration", async () => {
    const result = await runWorkerScenario("multiple");
    expect(result).toMatchObject({
      first: { formatted: "== Title ==\n" },
      second: { formatted: "== Second ==\n" },
      initialized: {
        configExtractions: 0,
        moduleEvaluations: 1,
        parseCalls: 0,
        parserIsOwn: false,
      },
      stats: {
        configExtractions: 0,
        moduleEvaluations: 1,
      },
    });
  });

  it("uses the captured parser after globalThis.Parser is replaced", async () => {
    await expect(runWorkerScenario("replace")).resolves.toEqual({
      formatted: "== Title ==\n",
    });
  });

  it("uses the captured parser after globalThis.Parser is deleted", async () => {
    await expect(runWorkerScenario("delete")).resolves.toEqual({
      formatted: "== Title ==\n",
    });
  });

  it("restores a pre-existing global Parser property", async () => {
    await expect(runWorkerScenario("restore", true)).resolves.toEqual({
      configurable: true,
      enumerable: false,
      restored: true,
      writable: true,
    });
  });

  it("retains structured failures for unsupported configurations", async () => {
    const result = await runWorkerScenario("unsupported");
    expect(result).toMatchObject({
      failure: {
        code: "unsupported-parser-config",
        stage: "parser-config",
      },
      formatted: "==Title==\n",
    });
  });
});

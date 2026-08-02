import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compareParserConfigs,
  deriveCodeMirrorScriptPath,
  generateSiteParserConfig,
  isolatedCodeMirrorModuleExecutor,
  serializeGeneratedParserConfig,
  writeGeneratedParserConfig,
} from "../src/parserConfigGeneration.js";
import { formatWikitext } from "../src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "wikitext-fmt-parser-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const codeMirrorConfig = {
  tags: { ref: true },
  tagModes: {},
  urlProtocols: "http://|https://|mailto:",
  functionSynonyms: [{ "#if": "#if" }, {}],
  doubleUnderscore: [{}, {}],
  functionHooks: ["msgnw"],
  variableIDs: ["pageid"],
  redirection: ["#redirect"],
  subst: { subst: "subst" },
  imageKeywords: { thumb: "thumbnail" },
};

const siteInfo = {
  query: {
    general: {
      articlepath: "/wiki/$1",
      server: "https://wiki.example",
      langconversion: "",
    },
    namespaces: [
      { id: 0, name: "", canonical: "" },
      { id: 6, name: "File", canonical: "File" },
      { id: 14, name: "Category", canonical: "Category" },
    ],
    namespacealiases: [{ id: 6, alias: "Image" }],
    magicwords: [
      { name: "msgnw", aliases: ["msgnw"], "case-sensitive": false },
      { name: "msg", aliases: ["msg"], "case-sensitive": false },
      { name: "raw", aliases: ["raw"], "case-sensitive": false },
      { name: "subst", aliases: ["subst"], "case-sensitive": false },
      { name: "safesubst", aliases: ["safesubst"], "case-sensitive": false },
      { name: "redirect", aliases: ["#REDIRECT"], "case-sensitive": false },
      { name: "img_thumb", aliases: ["thumb"], "case-sensitive": false },
    ],
    interwikimap: [
      { prefix: "w", local: false },
      { prefix: "File", local: false },
    ],
    languagevariants: [],
    extensiontags: ["ref"],
    functionhooks: ["msgnw"],
    variables: ["pageid"],
    doubleunderscores: [],
    protocols: ["http://", "https://", "mailto:"],
  },
};

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/load.php")) {
      return new Response("mw.loader.implement('ext.CodeMirror.data', {});", {
        headers: { "content-type": "application/javascript" },
      });
    }
    return new Response(JSON.stringify(siteInfo), {
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("explicit parser-config generation", () => {
  it("does not make ordinary formatting fetch or execute parser configuration", () => {
    const fetchImplementation = vi.fn();
    vi.stubGlobal("fetch", fetchImplementation);
    try {
      expect(formatWikitext("==Title==\n")).toBe("== Title ==\n");
      expect(fetchImplementation).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("executes a downloaded module only inside the isolated child executor", async () => {
    await expect(
      isolatedCodeMirrorModuleExecutor.execute(
        `mw.config.set({ extCodeMirrorConfig: ${JSON.stringify(codeMirrorConfig)} });`,
        { timeoutMilliseconds: 5_000, maxOutputBytes: 10_000 },
      ),
    ).resolves.toEqual(codeMirrorConfig);
  });

  it("derives a script directory only from an unambiguous API URL", () => {
    expect(deriveCodeMirrorScriptPath("https://wiki.example/w/api.php")).toBe(
      "https://wiki.example/w/",
    );
    expect(() => deriveCodeMirrorScriptPath("https://wiki.example/api")).toThrow(
      /scriptPath is required/u,
    );
  });

  it("generates reproducible validated ConfigData from injected inputs", async () => {
    const fetchImplementation = fixtureFetch();
    const executor = { execute: vi.fn(async () => codeMirrorConfig) };
    const options = {
      apiUrl: "https://wiki.example/w/api.php?token=secret",
      fetchImplementation,
      executor,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    } as const;

    const first = await generateSiteParserConfig(options);
    const second = await generateSiteParserConfig(options);

    expect(first.configData.nsid).toMatchObject({ "": 0, file: 6, image: 6 });
    expect(first.configData.interwiki).toEqual(["w"]);
    expect(first.provenance).toMatchObject({
      apiUrl: "https://wiki.example/w/api.php",
      scriptPath: "https://wiki.example/w/",
      generatedAt: "2026-08-02T00:00:00.000Z",
      generator: "wikitext-fmt-codemirror",
    });
    expect(serializeGeneratedParserConfig(first.configData)).toBe(
      serializeGeneratedParserConfig(second.configData),
    );
    expect(first.provenance).toEqual(second.provenance);
    expect(JSON.stringify(first.provenance)).not.toContain("secret");
  });

  it("fails closed on an oversized module before running the executor", async () => {
    const executor = { execute: vi.fn() };
    await expect(
      generateSiteParserConfig({
        apiUrl: "https://wiki.example/api.php",
        maxModuleBytes: 3,
        executor,
        fetchImplementation: fixtureFetch(),
      }),
    ).rejects.toThrow(/maximum response size/u);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("reports semantic drift by top-level field while ignoring set order", async () => {
    const generated = await generateSiteParserConfig({
      apiUrl: "https://wiki.example/api.php",
      fetchImplementation: fixtureFetch(),
      executor: { execute: async () => codeMirrorConfig },
    });
    const reordered = {
      ...generated.configData,
      interwiki: [...generated.configData.interwiki].reverse(),
      ext: [...generated.configData.ext].reverse(),
    };
    expect(compareParserConfigs(reordered, generated.configData)).toMatchObject({
      equal: true,
      changedFields: [],
    });
    const changed = {
      ...generated.configData,
      variable: [...generated.configData.variable, "newvariable"],
    };
    expect(compareParserConfigs(changed, generated.configData)).toMatchObject({
      equal: false,
      changedFields: ["variable"],
    });
  });

  it("atomically writes ConfigData and separate provenance without accidental overwrite", async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, "config", "site.parser.json");
    const generated = await generateSiteParserConfig({
      apiUrl: "https://wiki.example/api.php",
      fetchImplementation: fixtureFetch(),
      executor: { execute: async () => codeMirrorConfig },
    });
    const paths = await writeGeneratedParserConfig(outputPath, generated);
    expect(JSON.parse(await readFile(paths.outputPath, "utf8"))).toMatchObject({
      nsid: { "": 0 },
    });
    expect(JSON.parse(await readFile(paths.provenancePath, "utf8"))).toMatchObject({
      schemaVersion: 1,
      configSha256: generated.provenance.configSha256,
    });
    await expect(writeGeneratedParserConfig(outputPath, generated)).rejects.toThrow(
      /already exists/u,
    );
  });
});

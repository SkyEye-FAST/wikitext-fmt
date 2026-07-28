import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("read-only target corpus builder", () => {
  it("streams an XML dump into separate deterministic source and metadata files", async () => {
    const output = await mkdtemp(resolve(tmpdir(), "wikitext-fmt-corpus-"));
    await run(
      process.execPath,
      [
        "scripts/build-target-corpus.mjs",
        "--xml",
        "tests/fixtures/sample-dump.xml",
        "--output",
        output,
        "--tier",
        "small",
        "--namespaces",
        "0,10",
        "--seed",
        "test-seed",
      ],
      { cwd: resolve(import.meta.dirname, "..") },
    );
    const manifest = JSON.parse(
      await readFile(resolve(output, "manifest.json"), "utf8"),
    ) as {
      pagesDiscovered: number;
      pagesSelected: number;
      namespaceDistribution: Record<string, number>;
      readOnly: boolean;
    };
    const metadata = JSON.parse(
      await readFile(resolve(output, "metadata/pages.json"), "utf8"),
    ) as Array<{
      title: string;
      sourceFile: string;
      sha256: string;
      contentModel: string;
    }>;
    expect(manifest).toMatchObject({
      pagesDiscovered: 3,
      pagesSelected: 2,
      namespaceDistribution: { "0": 1, "10": 1 },
      readOnly: true,
    });
    expect(metadata.map((page) => page.title).sort()).toEqual([
      "Alpha",
      "Template:Beta",
    ]);
    expect(metadata.every((page) => page.sha256.length === 64)).toBe(true);
    expect(metadata.every((page) => page.contentModel === "wikitext")).toBe(
      true,
    );
    const alpha = metadata.find((page) => page.title === "Alpha")!;
    expect(await readFile(resolve(output, alpha.sourceFile), "utf8")).toBe(
      "{{T|one|two}} & A",
    );
  });

  it("normalizes mocked API siteinfo and applies manifest configuration end to end", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "wikitext-fmt-api-corpus-"));
    const output = await mkdtemp(resolve(tmpdir(), "wikitext-fmt-api-output-"));
    const titles = resolve(root, "titles.txt");
    await writeFile(titles, "Alias page\nLua module\n", "utf8");
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      response.setHeader("content-type", "application/json");
      if (url.searchParams.get("meta") === "siteinfo") {
        response.end(
          JSON.stringify({
            query: {
              namespaces: [
                { id: 6, canonical: "File", name: "FileX" },
                { id: 14, canonical: "Category", name: "CatX" },
              ],
              namespacealiases: [{ id: 14, name: "CategoryX" }],
              magicwords: [
                { name: "defaultsort", aliases: ["SORTX:"] },
                { name: "redirect", aliases: ["#GO"] },
                { name: "img_thumbnail", aliases: ["miniX"] },
                { name: "notoc", aliases: ["__NOTOCX__"] },
              ],
              doubleunderscores: ["notoc"],
            },
          }),
        );
        return;
      }
      response.end(
        JSON.stringify({
          query: {
            pages: [
              {
                pageid: 1,
                ns: 0,
                title: "Alias page",
                revisions: [
                  {
                    revid: 2,
                    timestamp: "2026-01-01T00:00:00Z",
                    slots: {
                      main: {
                        contentmodel: "wikitext",
                        content: "[[CatX:Foo]]\nBody\n",
                      },
                    },
                  },
                ],
              },
              {
                pageid: 3,
                ns: 828,
                title: "Lua module",
                revisions: [
                  {
                    revid: 4,
                    timestamp: "2026-01-01T00:00:00Z",
                    slots: {
                      main: {
                        contentmodel: "Scribunto",
                        content: 'return "{{not_wikitext}}"',
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
      );
    });
    await new Promise<void>((resolveListen) =>
      server.listen(0, "127.0.0.1", resolveListen),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No server port");
      const api = `http://127.0.0.1:${address.port}/api.php`;
      await run(
        process.execPath,
        [
          "scripts/build-target-corpus.mjs",
          "--api",
          api,
          "--titles",
          titles,
          "--output",
          output,
          "--parser-config",
          "zhwiki",
        ],
        { cwd: resolve(import.meta.dirname, "..") },
      );

      const raw = JSON.parse(
        await readFile(resolve(output, "metadata/siteinfo.raw.json"), "utf8"),
      ) as { query: unknown };
      const aliases = JSON.parse(
        await readFile(
          resolve(output, "metadata/localization-aliases.json"),
          "utf8",
        ),
      ) as Record<string, unknown>;
      const manifest = JSON.parse(
        await readFile(resolve(output, "manifest.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(raw.query).toBeTruthy();
      expect(aliases).toMatchObject({
        categoryNamespaces: ["CatX", "Category", "CategoryX"],
        fileNamespaces: ["FileX", "File"],
        defaultsortMagicWords: ["SORTX:"],
        redirectMagicWords: ["#GO"],
        imageOptionAliases: { img_thumbnail: ["miniX"] },
        behaviorSwitches: { notoc: ["__NOTOCX__"] },
      });
      expect(manifest).toMatchObject({
        schemaVersion: 2,
        parserConfig: "zhwiki",
        tier: "small",
        pagesDiscovered: 2,
        pagesSelected: 1,
        excluded: { contentModel: 1 },
        metadata: {
          siteinfoRaw: "metadata/siteinfo.raw.json",
          localizationAliases: "metadata/localization-aliases.json",
        },
      });
      const pages = JSON.parse(
        await readFile(resolve(output, "metadata/pages.json"), "utf8"),
      ) as Array<{ contentModel: string }>;
      expect(pages).toEqual([
        expect.objectContaining({ contentModel: "wikitext" }),
      ]);

      const reportPath = resolve(root, "manifest-report.json");
      await run(
        process.execPath,
        [
          "scripts/run-corpus.mjs",
          output,
          "--output",
          reportPath,
        ],
        { cwd: resolve(import.meta.dirname, "..") },
      );
      const report = JSON.parse(await readFile(reportPath, "utf8")) as {
        parserConfig: string;
        pagesChanged: number;
        pagesProcessed: number;
        pagesWithStructuralNodes: number;
        pagesWithoutStructuralNodes: number;
        pagesStructurallyCovered: number;
        structuralNodesEligible: number;
        structuralNodesCovered: number;
        totalBytes: number;
        totalBytesBefore: number;
        totalBytesAfter: number;
        pageDiffs: unknown[];
        diffRatio: { p95: number };
        manifest: { tier: string };
      };
      expect(report).toMatchObject({
        parserConfig: "zhwiki",
        pagesChanged: 1,
        manifest: { tier: "small" },
      });
      expect(
        report.pagesWithStructuralNodes + report.pagesWithoutStructuralNodes,
      ).toBe(report.pagesProcessed);
      expect(report.pagesStructurallyCovered).toBeLessThanOrEqual(
        report.pagesWithStructuralNodes,
      );
      expect(report.structuralNodesCovered).toBeLessThanOrEqual(
        report.structuralNodesEligible,
      );
      expect(report.totalBytesBefore).toBe(report.totalBytes);
      expect(report.totalBytesAfter).toBeGreaterThan(0);
      expect(report.pageDiffs).toHaveLength(report.pagesProcessed);
      expect(report.diffRatio.p95).toBeGreaterThan(0);

      await expect(
        run(
          process.execPath,
          [
            "scripts/run-corpus.mjs",
            output,
            "--max-p95-diff-ratio",
            "0",
          ],
          { cwd: resolve(import.meta.dirname, "..") },
        ),
      ).rejects.toMatchObject({ code: 1 });

      const explicitAliases = resolve(root, "aliases.json");
      await writeFile(
        explicitAliases,
        JSON.stringify({ categoryNamespaces: ["OverrideCategory"] }),
      );
      const overrideReportPath = resolve(root, "override-report.json");
      await run(
        process.execPath,
        [
          "scripts/run-corpus.mjs",
          output,
          "--parser-config",
          "enwiki",
          "--siteinfo",
          explicitAliases,
          "--output",
          overrideReportPath,
        ],
        { cwd: resolve(import.meta.dirname, "..") },
      );
      expect(
        JSON.parse(await readFile(overrideReportPath, "utf8")),
      ).toMatchObject({
        parserConfig: "enwiki",
        pagesChanged: 0,
      });

      const isolatedReportPath = resolve(root, "isolated-report.json");
      await run(
        process.execPath,
        [
          "scripts/run-corpus.mjs",
          output,
          "--no-manifest",
          "--output",
          isolatedReportPath,
        ],
        { cwd: resolve(import.meta.dirname, "..") },
      );
      expect(
        JSON.parse(await readFile(isolatedReportPath, "utf8")),
      ).toMatchObject({
        parserConfig: "mediawiki",
        manifest: null,
      });
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    }
  });

  it("fails clearly for a manifest metadata reference that is missing", async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), "wikitext-fmt-broken-manifest-"),
    );
    await writeFile(
      resolve(directory, "manifest.json"),
      JSON.stringify({
        schemaVersion: 2,
        parserConfig: "mediawiki",
        metadata: {
          localizationAliases: "metadata/missing-aliases.json",
        },
      }),
    );
    await writeFile(resolve(directory, "page.wiki"), "Body\n");
    await expect(
      run(
        process.execPath,
        ["scripts/run-corpus.mjs", directory],
        { cwd: resolve(import.meta.dirname, "..") },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "Manifest localization aliases is missing or unreadable",
      ),
    });
  });

  it("audits and skips a non-wikitext page in an imported corpus", async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), "wikitext-fmt-content-model-"),
    );
    await writeFile(
      resolve(directory, "module.wiki"),
      'return "{{not_wikitext|a=1|b=2}}"\n',
    );
    await writeFile(
      resolve(directory, "manifest.json"),
      JSON.stringify({ metadata: { pages: "pages.json" } }),
    );
    await writeFile(
      resolve(directory, "pages.json"),
      JSON.stringify([
        {
          title: "Module:Example",
          namespace: 828,
          contentModel: "Scribunto",
          sourceFile: "module.wiki",
        },
      ]),
    );
    const reportPath = resolve(directory, "report.json");
    await run(
      process.execPath,
      [
        "scripts/run-corpus.mjs",
        directory,
        "--output",
        reportPath,
      ],
      { cwd: resolve(import.meta.dirname, "..") },
    );
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
      pagesInCorpus: 1,
      pagesProcessed: 0,
      pagesSkippedNonWikitext: 1,
      pagesAssumedWikitext: 0,
      totalBytes: 0,
      contentModelDistribution: { Scribunto: 1 },
      nonWikitextSkips: [
        expect.objectContaining({
          title: "Module:Example",
          contentModel: "Scribunto",
        }),
      ],
      warnings: 0,
      failures: [],
    });
  });

  it("copies a custom parser config into executable manifest metadata", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "wikitext-fmt-custom-parser-"));
    const output = await mkdtemp(resolve(tmpdir(), "wikitext-fmt-custom-output-"));
    const customConfig = resolve(root, "custom-parser.json");
    await writeFile(
      customConfig,
      await readFile(
        resolve("node_modules/wikiparser-node/config/default.json"),
        "utf8",
      ),
    );
    await run(
      process.execPath,
      [
        "scripts/build-target-corpus.mjs",
        "--xml",
        "tests/fixtures/sample-dump.xml",
        "--output",
        output,
        "--parser-config",
        customConfig,
      ],
      { cwd: resolve(import.meta.dirname, "..") },
    );
    const manifest = JSON.parse(
      await readFile(resolve(output, "manifest.json"), "utf8"),
    );
    expect(manifest.parserConfig).toEqual({
      file: "metadata/parser-config.json",
      original: customConfig,
    });
    const reportPath = resolve(root, "report.json");
    await run(
      process.execPath,
      [
        "scripts/run-corpus.mjs",
        output,
        "--output",
        reportPath,
      ],
      { cwd: resolve(import.meta.dirname, "..") },
    );
    expect(
      (JSON.parse(await readFile(reportPath, "utf8")) as {
        parserConfig: string;
      }).parserConfig,
    ).toBe(resolve(output, "metadata/parser-config.json"));
  });
});

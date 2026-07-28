import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
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
    ) as Array<{ title: string; sourceFile: string; sha256: string }>;
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
    const alpha = metadata.find((page) => page.title === "Alpha")!;
    expect(await readFile(resolve(output, alpha.sourceFile), "utf8")).toBe(
      "{{T|one|two}} & A",
    );
  });
});

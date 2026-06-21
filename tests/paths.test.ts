import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { expandInputPaths } from "../src/cli/paths.js";

const temporaryDirectories: string[] = [];

async function fixtureDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wikitext-fmt-paths-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "pages", "nested"), { recursive: true });
  await writeFile(join(root, "pages", "b.wiki"), "B");
  await writeFile(join(root, "pages", "nested", "a.wiki"), "A");
  await writeFile(join(root, "pages", "ignored.txt"), "X");
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("CLI input expansion", () => {
  it("combines explicit files and globs in stable sorted order without duplicates", async () => {
    const root = await fixtureDirectory();
    const paths = await expandInputPaths(
      ["pages/b.wiki", "pages/**/*.wiki"],
      root,
    );
    expect(paths.map((path) => relative(root, path))).toEqual([
      "pages/b.wiki",
      "pages/nested/a.wiki",
    ]);
  });

  it("rejects unmatched globs", async () => {
    const root = await fixtureDirectory();
    await expect(expandInputPaths(["missing/**/*.wiki"], root)).rejects.toThrow(
      /matched no files/u,
    );
  });

  it("rejects directories", async () => {
    const root = await fixtureDirectory();
    await expect(expandInputPaths(["pages"], root)).rejects.toThrow(
      /not a file/u,
    );
  });
});

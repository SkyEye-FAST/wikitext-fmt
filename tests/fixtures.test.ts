import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextSafe } from "../src/index.js";

const fixturesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixtureNames = (await readdir(fixturesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("format fixtures", () => {
  for (const name of fixtureNames) {
    it(name, async () => {
      const directory = resolve(fixturesRoot, name);
      const [input, expected] = await Promise.all([
        readFile(resolve(directory, "input.wiki"), "utf8"),
        readFile(resolve(directory, "expected.wiki"), "utf8"),
      ]);

      const result = formatWikitextSafe(input);
      expect(result.warning).toBeUndefined();
      expect(result.formatted).toBe(expected);
      expect(formatWikitext(result.formatted)).toBe(result.formatted);
    });
  }
});

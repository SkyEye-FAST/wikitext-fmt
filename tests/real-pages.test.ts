import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatWikitextSafe } from "../src/index.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";

const pagesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "real-pages",
);
const pages = (await readdir(pagesRoot))
  .filter((name) => extname(name) === ".wiki")
  .sort();
const parserConfig = getParserConfig("mediawiki");

describe("real page regressions", () => {
  for (const page of pages) {
    it(`${page} remains parseable and idempotent`, async () => {
      const input = await readFile(resolve(pagesRoot, page), "utf8");
      expect(() => parseWikitext(input, parserConfig)).not.toThrow();

      const once = formatWikitextSafe(input);
      expect(once.warning).toBeUndefined();
      expect(() => parseWikitext(once.formatted, parserConfig)).not.toThrow();

      const twice = formatWikitextSafe(once.formatted);
      expect(twice.warning).toBeUndefined();
      expect(twice.formatted).toBe(once.formatted);
    });
  }
});

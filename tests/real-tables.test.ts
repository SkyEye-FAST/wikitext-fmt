import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatWikitextSafe } from "../src/index.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";

const tablesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "real-tables");
const tables = (await readdir(tablesRoot)).filter((name) => extname(name) === ".wiki").sort();
const parserConfig = getParserConfig("mediawiki");
const options = {
  level: "experimental",
  formatTables: true,
  tableCellSeparatorStyle: "auto",
} as const;

describe("realistic table corpus", () => {
  for (const table of tables) {
    it(`${table} remains parseable and idempotent`, async () => {
      const input = await readFile(resolve(tablesRoot, table), "utf8");
      expect(() => parseWikitext(input, parserConfig)).not.toThrow();

      const once = formatWikitextSafe(input, options);
      expect(once.warning).toBeUndefined();
      expect(() => parseWikitext(once.formatted, parserConfig)).not.toThrow();

      const twice = formatWikitextSafe(once.formatted, options);
      expect(twice.warning).toBeUndefined();
      expect(twice.formatted).toBe(once.formatted);
    });
  }
});

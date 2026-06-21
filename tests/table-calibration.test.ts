import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatWikitextSafe } from "../src/index.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";

const samplesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "table-samples");
const samples = (await readdir(samplesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const parserConfig = getParserConfig("mediawiki");
const options = {
  level: "experimental",
  formatTables: true,
  tableCellSeparatorStyle: "auto",
} as const;

describe("realistic table calibration samples", () => {
  for (const sample of samples) {
    it(`${sample} has the expected safe, idempotent diff`, async () => {
      const directory = resolve(samplesRoot, sample);
      const [input, expected] = await Promise.all([
        readFile(resolve(directory, "input.wiki"), "utf8"),
        readFile(resolve(directory, "expected.wiki"), "utf8"),
      ]);

      const once = formatWikitextSafe(input, options);
      expect(once.warning).toBeUndefined();
      expect(once.formatted).toBe(expected);
      expect(() => parseWikitext(once.formatted, parserConfig)).not.toThrow();

      const twice = formatWikitextSafe(once.formatted, options);
      expect(twice.warning).toBeUndefined();
      expect(twice.formatted).toBe(once.formatted);
    });
  }
});

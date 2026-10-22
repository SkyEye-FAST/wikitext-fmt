import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FormatOptions } from "../src/index.js";
import { formatWikitext, formatWikitextSafe } from "../src/index.js";

const fixturesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const integrationFixtureNames = new Set([
  "integration-article",
  "integration-redirect",
  "integration-infobox",
  "integration-list-heavy",
  "integration-table-heavy",
  "regression-pack-list-table-idempotency",
  "regression-interface-table-idempotency",
  "regression-background-list-table-idempotency",
]);

const fixtureNames = (await readdir(fixturesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !integrationFixtureNames.has(entry.name))
  .map((entry) => entry.name)
  .sort();

async function readFixtureOptions(directory: string): Promise<FormatOptions> {
  try {
    return JSON.parse(
      await readFile(resolve(directory, "options.json"), "utf8"),
    ) as FormatOptions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

describe("format fixtures", () => {
  for (const name of fixtureNames) {
    it(name, async () => {
      const directory = resolve(fixturesRoot, name);
      const [input, expected, options] = await Promise.all([
        readFile(resolve(directory, "input.wiki"), "utf8"),
        readFile(resolve(directory, "expected.wiki"), "utf8"),
        readFixtureOptions(directory),
      ]);

      const result = formatWikitextSafe(input, options);
      expect(result.warning).toBeUndefined();
      expect(result.formatted).toBe(expected);
      expect(formatWikitext(result.formatted, options)).toBe(result.formatted);
    });
  }
});

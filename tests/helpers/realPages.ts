import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import {
  formatWikitextSafeDetailed,
  type FormatOptions,
} from "../../src/index.js";
import { createDiagnosticsSummary } from "../../src/cli/diagnostics.js";
import { getParserConfig, parseWikitext } from "../../src/parser.js";

export const realPagesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "real-pages",
);

const parserConfig = getParserConfig("mediawiki");

export async function listRealPages(): Promise<string[]> {
  return (await readdir(realPagesRoot))
    .filter((name) => extname(name) === ".wiki")
    .sort();
}

export async function readRealPage(page: string): Promise<string> {
  return readFile(resolve(realPagesRoot, page), "utf8");
}

export async function expectRealPageRegression(
  page: string,
  options: FormatOptions = {},
): Promise<void> {
  const input = await readRealPage(page);
  expect(() => parseWikitext(input, parserConfig)).not.toThrow();

  const once = formatWikitextSafeDetailed(input, options);
  expect(once.warning).toBeUndefined();
  expect(() => parseWikitext(once.formatted, parserConfig)).not.toThrow();

  const summary = createDiagnosticsSummary(once);
  for (const value of Object.values(summary)) {
    expect(Number.isSafeInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
  expect(summary.tables).toBe(once.tableDiagnostics.length);
  expect(
    summary.tablesChanged +
      summary.tablesAlreadyCanonical +
      summary.tablesSkippedAmbiguous,
  ).toBe(summary.tablesInspected);
  expect(
    summary.tablesChanged + summary.tablesAlreadyCanonical,
  ).toBe(summary.tablesEligible);
  expect(
    summary.templatesChanged +
      summary.templatesAlreadyCanonical +
      summary.templatesSkippedAmbiguous,
  ).toBe(summary.templatesInspected);
  expect(
    summary.templatesChanged + summary.templatesAlreadyCanonical,
  ).toBe(summary.templatesEligible);
  expect(summary.formattedLines).toBe(
    once.tableDiagnostics.reduce(
      (count, diagnostic) =>
        count +
        (diagnostic.lineDiagnostics?.filter((line) => line.changed).length ??
          0),
      0,
    ),
  );
  expect(summary.skippedUnsafeLines).toBe(
    once.tableDiagnostics.reduce(
      (count, diagnostic) =>
        count +
        (diagnostic.lineDiagnostics?.filter((line) => line.reason).length ??
          0),
      0,
    ),
  );

  const twice = formatWikitextSafeDetailed(once.formatted, options);
  expect(twice.warning).toBeUndefined();
  expect(twice.formatted).toBe(once.formatted);
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";
import type { FormatOptions } from "../src/index.js";
import { createDiagnosticsSummary } from "../src/cli/diagnostics.js";

interface IntegrationCase {
  name: string;
  expectedSummary: Partial<ReturnType<typeof createDiagnosticsSummary>>;
}

const cases: IntegrationCase[] = [
  {
    name: "integration-article",
    expectedSummary: {
      behaviorSwitchesMoved: 1,
      interlanguageLinksMoved: 2,
      fileLinksFormatted: 1,
      sectionSpacingBeforeHeadingsInserted: 1,
      sectionSpacingAfterHeadingsInserted: 1,
    },
  },
  {
    name: "integration-redirect",
    expectedSummary: {
      redirectsFormatted: 1,
      categoriesMoved: 0,
      sectionSpacingBeforeHeadingsInserted: 0,
      sectionSpacingAfterHeadingsInserted: 0,
    },
  },
  {
    name: "integration-infobox",
    expectedSummary: {
      fileLinksFormatted: 1,
      templateParametersFormatted: 1,
      templateParameterLinesFormatted: 1,
      templateParameterLinesSkippedUnsafe: 1,
    },
  },
  {
    name: "integration-list-heavy",
    expectedSummary: {
      fileLinksFormatted: 1,
      categoriesMoved: 0,
    },
  },
  {
    name: "integration-table-heavy",
    expectedSummary: {
      tables: 0,
      categoriesMoved: 0,
    },
  },
];

async function readOptions(directory: string): Promise<FormatOptions> {
  try {
    return JSON.parse(
      await readFile(resolve(directory, "options.json"), "utf8"),
    ) as FormatOptions;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

describe("page-level integration fixtures", () => {
  for (const { name, expectedSummary } of cases) {
    it(`${name} has stable output, diagnostics, and idempotency`, async () => {
      const directory = resolve("tests", "fixtures", name);
      const [input, expected, options] = await Promise.all([
        readFile(resolve(directory, "input.wiki"), "utf8"),
        readFile(resolve(directory, "expected.wiki"), "utf8"),
        readOptions(directory),
      ]);
      const result = formatWikitextDetailedResult(input, options);
      expect(result.warning).toBeUndefined();
      expect(result.formatted).toBe(expected);
      expect(formatWikitext(result.formatted, options)).toBe(result.formatted);
      expect(createDiagnosticsSummary(result)).toMatchObject(expectedSummary);
    });
  }
});

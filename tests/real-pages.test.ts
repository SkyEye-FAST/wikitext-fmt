import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatWikitextSafeDetailed,
  type FormatOptions,
} from "../src/index.js";
import { createDiagnosticsSummary } from "../src/cli/diagnostics.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";

const pagesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "real-pages",
);
const pages = (await readdir(pagesRoot))
  .filter((name) => extname(name) === ".wiki")
  .sort();
const parserConfig = getParserConfig("mediawiki");

const matrix: Array<{ name: string; options: FormatOptions }> = [
  { name: "default normal", options: {} },
  {
    name: "experimental structure",
    options: {
      level: "experimental",
      formatSectionSpacing: true,
      formatInterlanguageLinks: true,
      interlanguagePlacement: "footer",
    },
  },
  {
    name: "experimental template parameters",
    options: {
      level: "experimental",
      formatTemplateParameters: true,
    },
  },
  {
    name: "experimental tables",
    options: {
      level: "experimental",
      formatTables: true,
      tableCellSeparatorStyle: "auto",
    },
  },
  {
    name: "canonical localization",
    options: {
      localizedSyntaxStyle: "canonical-english",
      behaviorSwitchPlacement: "footer",
    },
  },
  {
    name: "combined experimental safe run",
    options: {
      level: "experimental",
      formatTemplateParameters: true,
      formatSectionSpacing: true,
      formatInterlanguageLinks: true,
      interlanguagePlacement: "footer",
      localizedSyntaxStyle: "canonical-english",
      behaviorSwitchPlacement: "footer",
    },
  },
];

describe("real page regressions", () => {
  for (const page of pages) {
    for (const { name, options } of matrix) {
      it(`${page} remains parseable and idempotent with ${name}`, async () => {
        const input = await readFile(resolve(pagesRoot, page), "utf8");
        expect(() => parseWikitext(input, parserConfig)).not.toThrow();

        const once = formatWikitextSafeDetailed(input, options);
        expect(once.warning).toBeUndefined();
        expect(() => parseWikitext(once.formatted, parserConfig)).not.toThrow();

        const twice = formatWikitextSafeDetailed(once.formatted, options);
        expect(twice.warning).toBeUndefined();
        expect(twice.formatted).toBe(once.formatted);
      });
    }
  }

  it("exercises diagnostics across real page-shaped fixtures", async () => {
    const feature = await readFile(
      resolve(pagesRoot, "feature-article.wiki"),
      "utf8",
    );
    const redirect = await readFile(
      resolve(pagesRoot, "redirect-page.wiki"),
      "utf8",
    );

    const defaultSummary = createDiagnosticsSummary(
      formatWikitextSafeDetailed(feature),
    );
    expect(defaultSummary.fileLinksFormatted).toBeGreaterThan(0);
    expect(defaultSummary.categoriesMoved).toBeGreaterThan(0);

    const structureSummary = createDiagnosticsSummary(
      formatWikitextSafeDetailed(feature, {
        level: "experimental",
        formatSectionSpacing: true,
        formatInterlanguageLinks: true,
        interlanguagePlacement: "footer",
      }),
    );
    expect(structureSummary.interlanguageLinksMoved).toBeGreaterThan(0);
    expect(structureSummary.interlanguageLinksFormatted).toBe(0);
    expect(
      structureSummary.sectionSpacingBeforeHeadingsInserted,
    ).toBeGreaterThan(0);
    expect(
      structureSummary.sectionSpacingAfterHeadingsInserted,
    ).toBeGreaterThan(0);

    const templateSummary = createDiagnosticsSummary(
      formatWikitextSafeDetailed(feature, {
        level: "experimental",
        formatTemplateParameters: true,
      }),
    );
    expect(templateSummary.templateParameterLinesFormatted).toBeGreaterThan(0);
    expect(templateSummary.templateParameterLinesSkippedUnsafe).toBeGreaterThan(
      0,
    );

    const redirectSummary = createDiagnosticsSummary(
      formatWikitextSafeDetailed(redirect),
    );
    expect(redirectSummary.redirectsFormatted).toBeGreaterThan(0);

    const canonicalSummary = createDiagnosticsSummary(
      formatWikitextSafeDetailed(feature, {
        localizedSyntaxStyle: "canonical-english",
        behaviorSwitchPlacement: "footer",
      }),
    );
    expect(
      canonicalSummary.localizedCategoryAliasesCanonicalized,
    ).toBeGreaterThan(0);
    expect(
      canonicalSummary.localizedFileNamespaceAliasesCanonicalized,
    ).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { createDiagnosticsSummary } from "../src/cli/diagnostics.js";
import {
  type FormatOptions,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import {
  expectRealPageRegression,
  listRealPages,
  readRealPage,
} from "./helpers/realPages.js";

const pages = await listRealPages();

const matrix: Array<{ name: string; options: FormatOptions }> = [
  { name: "default normal", options: {} },
  {
    name: "canonical localization",
    options: {
      localizedSyntaxStyle: "canonical-english",
    },
  },
  {
    name: "normal section spacing",
    options: {
      level: "normal",
      formatSectionSpacing: true,
    },
  },
  {
    name: "normal tables",
    options: {
      level: "normal",
      formatTables: true,
      tableCellSeparatorStyle: "auto",
    },
  },
  {
    name: "normal references",
    options: {
      level: "normal",
      formatReferences: true,
    },
  },
  {
    name: "normal external links",
    options: {
      level: "normal",
      formatExternalLinks: true,
    },
  },
  {
    name: "normal references and external links",
    options: {
      level: "normal",
      formatReferences: true,
      formatExternalLinks: true,
    },
  },
  {
    name: "normal tables, references, and external links",
    options: {
      level: "normal",
      formatTables: true,
      tableCellSeparatorStyle: "auto",
      formatReferences: true,
      formatExternalLinks: true,
    },
  },
  {
    name: "all formatting opt-ins",
    options: {
      level: "experimental",
      formatSectionSpacing: true,
      formatReferences: true,
      formatExternalLinks: true,
      formatTables: true,
      tableCellSeparatorStyle: "auto",
      formatInterlanguageLinks: true,
      interlanguagePlacement: "footer",
    },
  },
  {
    name: "all formatting opt-ins with canonical footer localization",
    options: {
      level: "experimental",
      formatSectionSpacing: true,
      formatReferences: true,
      formatExternalLinks: true,
      formatTables: true,
      tableCellSeparatorStyle: "auto",
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
        await expectRealPageRegression(page, options);
      });
    }
  }

  it("exercises diagnostics across real page-shaped fixtures", async () => {
    const feature = await readRealPage("feature-article.wiki");
    const redirect = await readRealPage("redirect-page.wiki");

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
      formatWikitextSafeDetailed(feature),
    );
    expect(templateSummary.templatesChanged).toBeGreaterThan(0);
    expect(templateSummary.uniqueTemplatesFormatted).toBeGreaterThan(0);

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

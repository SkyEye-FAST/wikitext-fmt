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
    name: "production",
    options: { profile: "production" },
  },
  {
    name: "production with canonical footer localization",
    options: {
      profile: "production",
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
        profile: "production",
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

  it("formats the mixed interlanguage footer corpus page exactly in production", async () => {
    const source = await readRealPage("footer-heavy-page.wiki");
    const expected = [
      "__NOTOC__",
      "Lead text for the footer-heavy page.",
      "[[commons:Generic interwiki stays in the body]]",
      "[[:en:Leading-colon body link]]",
      "{{FooterProbe|language=[[en:Template body link]]}}",
      "<ref>[[ja:Reference body link]]</ref>",
      "<!-- [[zh:Comment body link]] -->",
      "<nowiki>[[de:Extension body link]]</nowiki>",
      "",
      "== Details ==",
      "",
      "The page deliberately mixes footer metadata with article content.",
      "",
      "__NOEDITSECTION__",
      "",
      "{{DEFAULTSORT:Regression, Footer}}",
      "[[Category:Initially misplaced]]",
      "[[Category:Formatter tests|Footer]]",
      "[[分類:回帰テスト]]",
      "[[分类:格式化测试]]",
      "",
      "[[en:Footer regression page]]",
      "[[ja:フッター回帰ページ]]",
      "[[zh-hant:頁尾回歸頁面]]",
      "",
    ].join("\n");
    const result = formatWikitextSafeDetailed(source, {
      profile: "production",
    });
    expect(result.failure).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(expected);
    expect(result.equivalenceDiagnostics.every((entry) => entry.equivalent)).toBe(
      true,
    );
    expect(
      formatWikitextSafeDetailed(expected, { profile: "production" }).formatted,
    ).toBe(expected);
  });
});

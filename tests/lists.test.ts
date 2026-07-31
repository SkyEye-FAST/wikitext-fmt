import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
  verifyStructuralEquivalence,
} from "../src/index.js";
import { resolveOptions } from "../src/options.js";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import {
  formatLists,
  formatListsWithDiagnostics,
} from "../src/rules/lists.js";

const config = getParserConfig("mediawiki");
const resolved = resolveOptions({});

function formatListsDirect(source: string): string {
  return formatLists(source, config, createParserContext(source, config));
}

function assertListPipeline(source: string, expected: string): void {
  expect(formatListsDirect(source)).toBe(expected);

  const detailed = formatWikitextDetailedResult(source);
  expect(detailed.formatted).toBe(expected);
  expect(detailed.failure).toBeUndefined();

  const safe = formatWikitextSafeDetailed(source);
  expect(safe.formatted).toBe(expected);
  expect(safe.failure).toBeUndefined();

  const second = formatWikitextDetailedResult(expected);
  expect(second.formatted).toBe(expected);
  expect(second.failure).toBeUndefined();
  expect(second.listDiagnostics.listLinesChanged).toBe(0);

  expect(
    verifyStructuralEquivalence(
      source,
      expected,
      config,
      "document",
      resolved,
    ),
  ).toMatchObject({ equivalent: true });
}

describe("list formatting", () => {
  it.each([
    ["*item", "* item"],
    ["*  item", "* item"],
    ["*\titem", "* item"],
    ["* \t item", "* item"],
    ["**item", "** item"],
    ["**   item", "** item"],
    ["#item", "# item"],
    ["##item", "## item"],
    ["##\t\titem", "## item"],
    [":definition", ": definition"],
    [";term", "; term"],
    [":*item", ":* item"],
    [":*   item", ":* item"],
    [":#item", ":# item"],
    ["::*item", "::* item"],
    [":*#item", ":*# item"],
    ["*#item", "*# item"],
    ["#*item", "#* item"],
    [":;item", ":; item"],
    [";:item", ";: item"],
    [";Term : definition", "; Term : definition"],
    ["* already spaced", "* already spaced"],
    ["* item   ", "* item"],
    ["# item\t  ", "# item"],
  ])("formats parser-confirmed prefix %s", (input, expected) => {
    assertListPipeline(`${input}\n`, `${expected}\n`);
  });

  it.each([
    ["*", "*"],
    ["*   ", "*"],
    ["#\t", "#"],
    [": \t ", ":"],
    [";:", ";:"],
    ["** \t", "**"],
  ])("keeps empty item %s free of trailing whitespace", (input, expected) => {
    assertListPipeline(`${input}\n`, `${expected}\n`);
  });

  it.each([
    [":c<!-- xxx -->", ": c<!-- xxx -->"],
    [":<!-- xxx -->c", ": <!-- xxx -->c"],
    [":c<!-- a --><!-- b -->", ": c<!-- a --><!-- b -->"],
    [":<!-- xxx -->", ": <!-- xxx -->"],
    [":*c<!-- xxx -->", ":* c<!-- xxx -->"],
    [":c<!--  preserve  -->", ": c<!--  preserve  -->"],
    [":c<!-- xxx -->   ", ": c<!-- xxx -->"],
    [":c   <!-- xxx -->", ": c   <!-- xxx -->"],
    [
      ":c<!-- {{ [[ <ref> remains comment text -->",
      ": c<!-- {{ [[ <ref> remains comment text -->",
    ],
  ])("formats a comment-bearing list item without changing comments: %s", (
    input,
    expected,
  ) => {
    assertListPipeline(`${input}\n`, `${expected}\n`);
  });

  it.each([
    [":{{Template}}", ": {{Template}}"],
    [":[[Page]]", ": [[Page]]"],
    [":[[Page|label]]", ": [[Page|label]]"],
    [":<ref>source</ref>", ": <ref>source</ref>"],
    [":<span>text</span>", ": <span>text</span>"],
    [":*{{Template}}<!-- comment -->", ":* {{Template}}<!-- comment -->"],
  ])("formats a parser-confirmed structured list item: %s", (input, expected) => {
    assertListPipeline(`${input}\n`, `${expected}\n`);
  });

  it("reports changed list categories", () => {
    const source =
      ":*item\n:c<!-- c -->\n:{{T}}\n* already canonical\n:\u00A0unchanged\n";
    const result = formatWikitextDetailedResult(source);

    expect(result.formatted).toBe(
      ":* item\n: c<!-- c -->\n: {{T}}\n* already canonical\n:\u00A0unchanged\n",
    );
    expect(result.listDiagnostics).toEqual({
      listLinesInspected: 5,
      listLinesEligible: 4,
      listLinesChanged: 3,
      listLinesAlreadyCanonical: 1,
      listLinesSkipped: 1,
      mixedMarkerLinesChanged: 1,
      commentBearingLinesChanged: 1,
      structuredContentLinesChanged: 1,
      skipReasons: { "unicode-separator": 1 },
    });
    expect(result.listDiagnostics.listLinesEligible).toBe(
      result.listDiagnostics.listLinesChanged +
        result.listDiagnostics.listLinesAlreadyCanonical,
    );
    expect(result.listDiagnostics.listLinesInspected).toBe(
      result.listDiagnostics.listLinesEligible +
        result.listDiagnostics.listLinesSkipped,
    );
  });

  it.each([
    ["U+00A0 NO-BREAK SPACE", "*\u00A0item"],
    ["U+202F NARROW NO-BREAK SPACE", "#\u202Fitem"],
    ["U+3000 IDEOGRAPHIC SPACE", ":\u3000item"],
  ])("preserves a %s separator", (_name, line) => {
    const source = `${line}\n`;
    expect(formatListsDirect(source)).toBe(source);
    expect(formatWikitextDetailedResult(source).formatted).toBe(source);
    expect(
      formatListsWithDiagnostics(
        source,
        config,
        createParserContext(source, config),
      ).diagnostics.skipReasons,
    ).toEqual({ "unicode-separator": 1 });
  });

  it("removes trailing ASCII layout without removing Unicode whitespace", () => {
    assertListPipeline("* item\u00A0\t  \n", "* item\u00A0\n");
  });

  it("formats LF and a missing final newline", () => {
    assertListPipeline(":a\n:*b   \n", ": a\n:* b\n");
    assertListPipeline(":a", ": a");
  });

  it("formats CRLF through the document normalization envelope", () => {
    const source = ":item\r\n:*item\r\n:c<!-- x -->\r\n:{{T}}\r\n";
    const expected =
      ": item\r\n:* item\r\n: c<!-- x -->\r\n: {{T}}\r\n";
    expect(formatListsDirect(source)).toBe(source);
    const result = formatWikitextDetailedResult(source);
    expect(result.formatted).toBe(expected);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).not.toMatch(/(^|[^\r])\n/u);

    const safe = formatWikitextSafeDetailed(source);
    expect(safe.formatted).toBe(expected);
    expect(safe.failure).toBeUndefined();
    expect(formatWikitext(expected)).toBe(expected);
  });

  it.each([
    [";term", "; term"],
    [";term : definition", "; term : definition"],
    [";term:definition", "; term:definition"],
    [";:item", ";: item"],
    [":;item", ":; item"],
  ])("preserves definition-list semantics for %s", (input, expected) => {
    assertListPipeline(`${input}\n`, `${expected}\n`);
  });

  it("keeps ignore-controlled list lines byte-for-byte", () => {
    const cases = [
      "<!-- wikitext-fmt-ignore -->\n:c\n",
      ":c<!-- wikitext-fmt-ignore -->\n",
      "<!-- wikitext-fmt-ignore-start -->\n:c\n<!-- wikitext-fmt-ignore-end -->\n",
    ];
    for (const source of cases) {
      const result = formatWikitextDetailedResult(source);
      expect(result.formatted).toBe(source);
      expect(result.listDiagnostics.skipReasons["ignore-range"]).toBe(1);
    }
  });

  it("does not format list-like text inside opaque blocks", () => {
    const source = [
      "<nowiki>",
      ":c",
      "</nowiki>",
      "<pre>",
      ":c",
      "</pre>",
      "<gallery>",
      ":c",
      "</gallery>",
      "<syntaxhighlight>",
      ":c",
      "</syntaxhighlight>",
      "<source>",
      ":c",
      "</source>",
      "<math>",
      ":c",
      "</math>",
      "<chem>",
      ":c",
      "</chem>",
      "<templatedata>",
      ":c",
      "</templatedata>",
      "{|",
      "| :c",
      "|}",
      "{{T|",
      ":c",
      "}}",
      "",
    ].join("\n");

    const result = formatWikitextDetailedResult(source);
    expect(result.formatted).toBe(source);
    expect(result.failure).toBeUndefined();
    expect(result.listDiagnostics.listLinesChanged).toBe(0);
    expect(result.listDiagnostics.skipReasons["protected-block"]).toBeGreaterThan(
      0,
    );
  });

  it.each([
    ":c<!-- unclosed",
    ":<!-- multiline\ncomment -->content",
    ":<ref>multi\nline</ref>",
  ])("fails closed for ambiguous or multiline content: %s", (source) => {
    const withNewline = `${source}\n`;
    const result = formatWikitextDetailedResult(withNewline);
    expect(result.formatted).toBe(withNewline);
    expect(result.listDiagnostics.listLinesChanged).toBe(0);
    expect(result.listDiagnostics.listLinesSkipped).toBeGreaterThan(0);
  });

  it.each([
    "* {| table   ",
    "* \uE000wikitext-fmt:0\uE001   ",
  ])("preserves explicitly protected content %s", (line) => {
    const source = `${line}\n`;
    const direct = formatListsWithDiagnostics(
      source,
      config,
      createParserContext(source, config),
    );
    expect(direct.formatted).toBe(source);
    expect(direct.diagnostics.skipReasons).toEqual({ "protected-block": 1 });
  });

  it("does not mistake redirect-like or ordinary prose syntax for list content", () => {
    const redirectLike = "#UNKNOWN[[Target]]\n";
    const redirectResult = formatListsWithDiagnostics(
      redirectLike,
      config,
      createParserContext(redirectLike, config),
    );
    expect(redirectResult.formatted).toBe(redirectLike);
    expect(redirectResult.diagnostics.skipReasons).toEqual({
      "ambiguous-marker-boundary": 1,
    });
    expect(formatListsDirect("ordinary:text\n")).toBe("ordinary:text\n");
  });

  it("can be disabled and is excluded from safe reliability level", () => {
    expect(formatWikitext("*item\n", { formatLists: false })).toBe("*item\n");
    expect(formatWikitext("*item\n", { level: "safe" })).toBe("*item\n");
  });
});

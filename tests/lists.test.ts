import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
  verifyStructuralEquivalence,
} from "../src/index.js";
import { resolveOptions } from "../src/options.js";
import { createNodeParserSession, getParserConfig } from "../src/parser.js";
import {
  formatLists,
  formatListsWithDiagnostics,
} from "../src/rules/lists.js";

const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);
const resolved = resolveOptions({});

function formatListsDirect(source: string): string {
  return formatLists(session.createContext(source));
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
    ["#正文[[Page]]", "# 正文[[Page]]"],
    [":<ref>source</ref>", ": <ref>source</ref>"],
    [":<span>text</span>", ": <span>text</span>"],
    [":*{{Template}}<!-- comment -->", ":* {{Template}}<!-- comment -->"],
  ])("formats a parser-confirmed structured list item: %s", (input, expected) => {
    assertListPipeline(`${input}\n`, `${expected}\n`);
  });

  it("formats parser-confirmed list items in nested template parameter values", () => {
    const source = [
      "{{News List",
      "| 1 = {{新闻单元",
      "| 内容 = 说明：",
      "*item",
      "**{{T}}",
      "#正文[[Page]]",
      "}}",
      "}}",
      "",
    ].join("\n");
    const expected = [
      "{{News List",
      "| 1 = {{新闻单元",
      "| 内容 = 说明：",
      "* item",
      "** {{T}}",
      "# 正文[[Page]]",
      "}}",
      "}}",
      "",
    ].join("\n");

    assertListPipeline(source, expected);
    expect(
      formatListsWithDiagnostics(session.createContext(source)).diagnostics,
    ).toMatchObject({
      listLinesInspected: 3,
      listLinesEligible: 3,
      listLinesChanged: 3,
      listLinesSkipped: 0,
      structuredContentLinesChanged: 2,
      skipReasons: {},
    });
  });

  it.each([
    '<ref name="used" />',
    '<ref name="used"/>',
    '<REF NAME="used"   />',
  ])(
    "does not let a self-closing reference protect following list lines: %s",
    (selfClosing) => {
      const source = `${selfClosing}\n*item\n<ref>later</ref>\n`;
      const expected = `${selfClosing}\n* item\n<ref>later</ref>\n`;

      assertListPipeline(source, expected);
    },
  );

  it("rejects multiline structured list content inside a template value", () => {
    const source = "{{T|\n:{{U|\n| x = y\n}}\n}}\n";
    const result = formatListsWithDiagnostics(session.createContext(source));

    expect(result.formatted).toBe(source);
    expect(result.diagnostics.skipReasons).toEqual({ "multiline-content": 1 });
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
        session.createContext(source),
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

  it.each([
    ["only-nowiki", "<nowiki>\n:c\n</nowiki>\n", "protected-block"],
    ["only-pre", "<pre>\n:c\n</pre>\n", "protected-block"],
    ["only-gallery", "<gallery>\n:c\n</gallery>\n", "protected-block"],
    [
      "only-syntaxhighlight",
      "<syntaxhighlight>\n:c\n</syntaxhighlight>\n",
      "protected-block",
    ],
    ["only-source", "<source>\n:c\n</source>\n", "protected-block"],
    [
      "template-inside-ref",
      "<ref>\n{{T|\n:c\n}}\n</ref>\n",
      "protected-block",
    ],
    ["only-math", "<math>\n:c\n</math>\n", "protected-block"],
    ["only-chem", "<chem>\n:c\n</chem>\n", "protected-block"],
    [
      "only-templatedata",
      "<templatedata>\n:c\n</templatedata>\n",
      "protected-block",
    ],
    ["only-table", "{|\n:c\n|}\n", "protected-block"],
    [
      "only-ignore-range",
      "<!-- wikitext-fmt-ignore-start -->\n:c\n<!-- wikitext-fmt-ignore-end -->\n",
      "ignore-range",
    ],
    [
      "only-comment",
      "<!-- ordinary comment\n:c\n-->\n",
      "not-parser-confirmed",
    ],
  ] as const)(
    "reports a precise skip reason for %s",
    (_name, source, skipReason) => {
      const result = formatListsWithDiagnostics(session.createContext(source));

      expect(result.formatted).toBe(source);
      expect(result.diagnostics).toEqual({
        listLinesInspected: 1,
        listLinesEligible: 0,
        listLinesChanged: 0,
        listLinesAlreadyCanonical: 0,
        listLinesSkipped: 1,
        mixedMarkerLinesChanged: 0,
        commentBearingLinesChanged: 0,
        structuredContentLinesChanged: 0,
        skipReasons: { [skipReason]: 1 },
      });
    },
  );

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
      session.createContext(source),
    );
    expect(direct.formatted).toBe(source);
    expect(direct.diagnostics.skipReasons).toEqual({ "protected-block": 1 });
  });

  it("uses parser evidence to distinguish numbered lists from redirects", () => {
    assertListPipeline(
      "#UNKNOWN[[Target]]\n",
      "# UNKNOWN[[Target]]\n",
    );

    const mixed = "#REDIRECT[[Target]]\n#item\n";
    const mixedResult = formatListsWithDiagnostics(session.createContext(mixed));
    expect(mixedResult.formatted).toBe("#REDIRECT[[Target]]\n# item\n");
    expect(mixedResult.diagnostics).toMatchObject({
      listLinesInspected: 2,
      listLinesEligible: 1,
      listLinesChanged: 1,
      listLinesSkipped: 1,
      skipReasons: { "not-parser-confirmed": 1 },
    });

    const configuredAlias = formatListsWithDiagnostics(
      session.createContext("#go[[Target]]\n"),
      { redirectMagicWords: ["GO"] },
    );
    expect(configuredAlias.formatted).toBe("#go[[Target]]\n");
    expect(configuredAlias.diagnostics.skipReasons).toEqual({
      "ambiguous-marker-boundary": 1,
    });
    expect(
      formatListsWithDiagnostics(
        session.createContext("#GOING[[Target]]\n"),
        { redirectMagicWords: ["GO"] },
      ).formatted,
    ).toBe("# GOING[[Target]]\n");

    expect(formatListsDirect("#重定向[[Target]]\n")).toBe(
      "#重定向[[Target]]\n",
    );
    expect(formatListsDirect("ordinary:text\n")).toBe("ordinary:text\n");
  });

  it("can be disabled and is excluded from safe reliability level", () => {
    expect(formatWikitext("*item\n", { formatLists: false })).toBe("*item\n");
    expect(formatWikitext("*item\n", { level: "safe" })).toBe("*item\n");
  });
});

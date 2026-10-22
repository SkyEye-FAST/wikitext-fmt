import { describe, expect, it } from "vitest";
import Parser from "wikiparser-node";

import { getParserConfig } from "../src/parser.js";

const config = getParserConfig("mediawiki");

interface TableNodeSummary {
  type: string | undefined;
  className: string;
  index: number | undefined;
  text: string;
}

function tableChildSummary(source: string): TableNodeSummary[] {
  const root = Parser.parse(source, false, undefined, config);
  const table = root.querySelector("table");
  expect(table).toBeTruthy();
  return [...(table?.childNodes ?? [])].map((node) => ({
    type: node.type,
    className: node.constructor.name,
    index:
      typeof node.getAbsoluteIndex === "function"
        ? node.getAbsoluteIndex()
        : undefined,
    text: node.toString(),
  }));
}

function cellTexts(source: string): string[] {
  return tableChildSummary(source)
    .filter((node) => node.type === "td" || node.type === "th")
    .map((node) => node.text);
}

describe("wikiparser-node table AST capabilities", () => {
  it("exposes table child nodes with source text and absolute indices", () => {
    const summary = tableChildSummary("{|\n! A !! B\n|-\n| C || D\n|}");

    expect(summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "table-syntax",
          className: "SyntaxToken",
          index: 0,
          text: "{|",
        }),
        expect.objectContaining({
          type: "td",
          className: "TdToken",
          index: 2,
          text: "\n! A ",
        }),
        expect.objectContaining({
          type: "td",
          className: "TdToken",
          index: 7,
          text: "!! B",
        }),
      ]),
    );
  });

  it("distinguishes parser-owned layouts for openers, rows, captions, and cells", () => {
    const root = Parser.parse(
      '{|class="wikitable"\n|-class="row"\n|+style="x"|Caption\n|Cell\n!Header\n|}',
      false,
      undefined,
      config,
    );
    const table = root.querySelector("table");
    expect(table).toBeTruthy();
    const [opener, openerAttributes, row] = [...(table?.childNodes ?? [])];
    const [, , caption, data, header] = [...(row?.childNodes ?? [])];
    expect([opener?.type, opener?.toString(), openerAttributes?.type, openerAttributes?.toString()]).toEqual([
      "table-syntax",
      "{|",
      "table-attrs",
      'class="wikitable"',
    ]);
    expect(
      row?.childNodes
        .slice(0, 2)
        .map((node) => [node.type, node.toString()]),
    ).toEqual([
      ["table-syntax", "\n|-"],
      ["table-attrs", 'class="row"'],
    ]);
    expect(caption?.subtype).toBe("caption");
    expect(caption?.childNodes.map((node) => [node.type, node.toString()])).toEqual([
      ["table-syntax", "\n|+"],
      ["table-attrs", 'style="x"'],
      ["td-inner", "Caption"],
    ]);
    expect(data?.childNodes.map((node) => [node.type, node.toString()])).toEqual([
      ["table-syntax", "\n|"],
      ["table-attrs", ""],
      ["td-inner", "Cell"],
    ]);
    expect(header?.subtype).toBe("th");
    expect(header?.childNodes.map((node) => [node.type, node.toString()])).toEqual([
      ["table-syntax", "\n!"],
      ["table-attrs", ""],
      ["td-inner", "Header"],
    ]);
  });

  it.each([
    [
      "balanced template pipes",
      "{|\n| {{Template|a=A || B}} || C\n|}",
      ["\n| {{Template|a=A || B}} ", "|| C"],
    ],
    [
      "simple templates",
      "{|\n| {{N/a}} || 1\n|}",
      ["\n| {{N/a}} ", "|| 1"],
    ],
  ])("distinguishes outer table separators from %s", (_name, source, expected) => {
    expect(cellTexts(source)).toEqual(expected);
  });

  // Table formatting is parser-assisted but not fully AST-driven:
  // wikiparser-node identifies standalone table ranges and exposes cell tokens
  // with source offsets, but raw top-level separator detection is still needed
  // for wikilink/external-link labels where the parser tokenizes `||` as table
  // cells. The fallback tokenizer is intentionally limited to table-cell
  // separator detection within parser-confirmed standalone table text.
  it.each([
    [
      "wikilink",
      "{|\n| [[Page|A || B]] || C\n|}",
      ["\n| [[Page|A ", "|| B]] ", "|| C"],
    ],
    [
      "external-link",
      "{|\n| [https://example.com A || B] || C\n|}",
      ["\n| [https://example.com A ", "|| B] ", "|| C"],
    ],
  ])("does not reliably distinguish table separators from %s label separators", (_name, source, expected) => {
    expect(cellTexts(source)).toEqual(expected);
  });
});

import Parser from "wikiparser-node";
import { describe, expect, it } from "vitest";
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

  it("distinguishes outer table separators from balanced template pipes", () => {
    expect(cellTexts("{|\n| {{Template|a=A || B}} || C\n|}")).toEqual([
      "\n| {{Template|a=A || B}} ",
      "|| C",
    ]);
  });

  it("provides enough source text to recover cells containing simple templates", () => {
    expect(cellTexts("{|\n| {{N/a}} || 1\n|}")).toEqual([
      "\n| {{N/a}} ",
      "|| 1",
    ]);
  });

  it("does not reliably distinguish table separators from wikilink label separators", () => {
    expect(cellTexts("{|\n| [[Page|A || B]] || C\n|}")).toEqual([
      "\n| [[Page|A ",
      "|| B]] ",
      "|| C",
    ]);
  });

  it("does not reliably distinguish table separators from external-link label separators", () => {
    expect(cellTexts("{|\n| [https://example.com A || B] || C\n|}")).toEqual([
      "\n| [https://example.com A ",
      "|| B] ",
      "|| C",
    ]);
  });

  it("therefore uses a hybrid strategy rather than a separate parser", () => {
    // Conclusion: table formatting is parser-assisted but not fully AST-driven.
    // wikiparser-node identifies standalone table ranges and exposes cell tokens
    // with source offsets, but raw top-level separator detection is still needed
    // for wikilink/external-link labels where the parser tokenizes `||` as table
    // cells. The fallback tokenizer is intentionally limited to table-cell
    // separator detection within parser-confirmed standalone table text.
    expect(cellTexts("{|\n| [[Page|A || B]] || C\n|}")).toHaveLength(3);
  });
});

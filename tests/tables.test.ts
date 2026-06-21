import { describe, expect, it } from "vitest";
import { formatWikitextDetailedResult } from "../src/formatter.js";
import { getParserConfig } from "../src/parser.js";
import { resolveOptions } from "../src/options.js";
import {
  analyzeSimpleTableForTesting,
  formatTablesWithDiagnostics,
} from "../src/rules/tables.js";

function expectSkip(raw: string, reason: RegExp): void {
  const result = analyzeSimpleTableForTesting(raw);
  expect(result.changed).toBe(false);
  if (!result.changed) expect(result.reason).toMatch(reason);
}

describe("experimental table analysis diagnostics", () => {
  it("reports protected placeholders", () => {
    expectSkip("{|\n| \uE000wikitext-fmt:0:\uE001\n|}", /placeholder/u);
  });

  it("reports templates", () => {
    expectSkip("{|\n| {{N\/a}}\n|}", /template/u);
  });

  it("reports HTML tags", () => {
    expectSkip("{|\n| <span>value<\/span>\n|}", /HTML|tag/u);
  });

  it("reports nested tables", () => {
    expectSkip("{|\n|\n{|\n| nested\n|}\n|}", /nested/u);
  });

  it("reports unbalanced tables", () => {
    expectSkip("{|\n| value", /unbalanced/u);
  });

  it("reports unsafe cell separators", () => {
    expectSkip("{|\n| style=\"A || B\" | C || D\n|}", /unsafe data cell separator/u);
  });

  it("reports unbalanced link brackets as an unsafe separator", () => {
    expectSkip("{|\n| [[A || B\n|}", /unsafe data cell separator/u);
  });

  it("reports unclear line types", () => {
    expectSkip("{|\nplain text\n|}", /unclear table line type/u);
  });

  it("returns changed output for a supported table", () => {
    expect(analyzeSimpleTableForTesting("{|\n! A !! B\n|}")).toEqual({
      changed: true,
      value: "{|\n! A\n! B\n|}",
    });
  });

  it("reports 1-based table line numbers", () => {
    const source = "Lead\n\n{| class=\"wikitable\"\n! A !! B\n|}\n";
    const result = formatTablesWithDiagnostics(
      source,
      getParserConfig("mediawiki"),
      resolveOptions({ level: "experimental", formatTables: true }),
    );
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ start: 6, line: 3, changed: true }),
    ]);
  });

  it("maps diagnostics back across multiline protected blocks", () => {
    const source = "<nowiki>\nraw\n</nowiki>\nLead\n{|\n| A || B\n|}\n";
    const result = formatWikitextDetailedResult(source, {
      level: "experimental",
      formatTables: true,
    });
    expect(result.tableDiagnostics).toEqual([
      expect.objectContaining({ start: source.indexOf("{|"), line: 5, changed: true }),
    ]);
  });

  it("does not collect table diagnostics when the experimental rule is disabled", () => {
    const result = formatWikitextDetailedResult("{|\n! A !! B\n|}\n", {
      level: "normal",
      formatTables: true,
    });
    expect(result.tableDiagnostics).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { analyzeSimpleTableForTesting } from "../src/rules/tables.js";

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

  it("reports unclear line types", () => {
    expectSkip("{|\nplain text\n|}", /unclear table line type/u);
  });

  it("returns changed output for a supported table", () => {
    expect(analyzeSimpleTableForTesting("{|\n! A !! B\n|}")).toEqual({
      changed: true,
      value: "{|\n! A\n! B\n|}",
    });
  });
});

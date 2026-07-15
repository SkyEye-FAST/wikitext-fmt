import { describe, expect, it } from "vitest";
import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import { getParserConfig } from "../src/parser.js";
import { formatTemplatesWithDiagnostics } from "../src/rules/templates.js";

describe("unified parser-assisted template formatting", () => {
  it("normalizes existing multiline templates at normal level", () => {
    const input = "{{Template   \n| a=b   \n| c =d\n| empty=   \n}}\n";
    expect(formatWikitext(input)).toBe(
      "{{Template\n| a = b\n| c = d\n| empty =\n}}\n",
    );
  });

  it("retains the old option as a compatibility route to the same engine", () => {
    const input = "{{Template\n| a=b\n}}\n";
    expect(
      formatWikitext(input, {
        level: "experimental",
        formatTemplates: false,
        formatTemplateParameters: true,
      }),
    ).toBe("{{Template\n| a = b\n}}\n");
  });

  it("can disable both compatibility entry points", () => {
    const input = "{{Template\n| a=b\n}}\n";
    expect(
      formatWikitext(input, {
        formatTemplates: false,
        formatTemplateParameters: false,
      }),
    ).toBe(input);
  });

  it("keeps a clearly compact single parameter inline", () => {
    expect(formatWikitext("{{Template|a=b}}\n")).toBe(
      "{{Template| a = b}}\n",
    );
  });

  it("preserves meaningful trailing whitespace in anonymous values", () => {
    const result = formatWikitextSafeDetailed("{{Template|one |named=value}}\n");
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe("{{Template|one |named = value}}\n");
  });

  it.each([
    ["plain", "{{T|foo}}\n"],
    ["leading space", "{{T| foo}}\n"],
    ["trailing space", "{{T|foo }}\n"],
    ["surrounding spaces", "{{T| foo }}\n"],
    ["empty before a value", "{{T||foo}}\n"],
    ["whitespace-only before a value", "{{T| |foo}}\n"],
    ["leading tab", "{{T|\tfoo}}\n"],
    ["multiline", "{{T|first line\nsecond line}}\n"],
  ])("preserves %s anonymous parameters byte-for-byte", (_name, input) => {
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
  });

  it("normalizes only named arguments in a mixed template", () => {
    const input = "{{T| first | named = value |2= numeric |last }}\n";
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(
      "{{T| first |named = value|2 = numeric|last }}\n",
    );
  });

  it("keeps explicit numeric parameters named", () => {
    const result = formatWikitextSafeDetailed("{{T|1= first |2= second }}\n");
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe("{{T\n| 1 = first\n| 2 = second\n}}\n");
  });

  it("preserves anonymous whitespace around a formatted nested template", () => {
    const input = "{{T| {{Nested|a=1|b=2}} }}\n";
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(
      "{{T| {{Nested\n| a = 1\n| b = 2\n}} }}\n",
    );
  });

  it("preserves comments and trivia between parser argument ranges", () => {
    const input =
      "{{T|first=one  <!-- between -->  |second=two\n<!-- standalone trivia -->\n|third=three}}\n";
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toContain("<!-- between -->");
    expect(result.formatted).toContain("<!-- standalone trivia -->");
    expect(result.equivalenceDiagnostics).toContainEqual({
      equivalent: true,
      structure: "templates",
    });
  });

  it.each([
    ["if", "{{#if:x|y|z}}\n"],
    ["intentional spaces", "{{#if: x | y | z }}\n"],
    ["tag", "{{#tag:nowiki| value with spaces |class= kept }}\n"],
    ["switch", "{{#switch: key | value = intentional | default }}\n"],
  ])("preserves parser-function argument bytes for %s", (_name, input) => {
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
  });

  it.each([
    ["nested template", "{{Nested|x=1|y=2}}"],
    ["parser function", "{{#if:x|y|z}}"],
    ["link", "[[Page|label]]"],
    ["reference", "<ref>source</ref>"],
    ["HTML", "<span>value</span>"],
    ["comment", "value<!-- comment -->"],
  ])("formats a template containing %s", (_name, value) => {
    const input = `{{Template|before=one|value=${value}|after=two}}\n`;
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).not.toBe(input);
    expect(result.formatted).toContain("| before = one");
    expect(result.formatted).toContain("| after = two");
    expect(result.equivalenceDiagnostics).toContainEqual({
      equivalent: true,
      structure: "templates",
    });
  });

  it("preserves multiline value content while formatting every parameter", () => {
    const input =
      "{{Template\n| first = line one\nline two\n| 中文 =值\n| 日本語= 値\n}}\n";
    expect(formatWikitext(input)).toBe(
      "{{Template\n| first = line one\nline two\n| 中文 = 值\n| 日本語 = 値\n}}\n",
    );
  });

  it("preserves protected blocks and explicit ignore ranges", () => {
    const input =
      '<nowiki>{{Template\n| a=b\n}}</nowiki>\n<!-- wikitext-fmt-ignore-start -->\n{{Template\n| c=d\n}}\n<!-- wikitext-fmt-ignore-end -->\n';
    expect(formatWikitext(input)).toBe(input);
  });

  it("formats templates inside table cells", () => {
    const input = "{|\n| {{Template\n| a=b\n}}\n|}\n";
    expect(formatWikitext(input)).toContain("| a = b");
  });

  it("formats nested templates deepest-first", () => {
    const input =
      "{{Outer|safe=value|nested={{Nested|x=1|y=2}}|parser={{#if:x|y|z}}}}\n";
    const result = formatWikitextDetailedResult(input);
    expect(result.formatted).toContain("{{Nested\n| x = 1\n| y = 2\n}}");
    expect(result.formatted).toContain("{{#if:x|y|z}}");
    expect(result.templateParameterDiagnostics.templatesFormatted).toBe(2);
    expect(result.templateParameterDiagnostics.formattingPassesUsed).toBeGreaterThan(1);
  });

  it("fails closed on a table opener the parser cannot balance", () => {
    const input = '{{Template\n| a = {| class="wikitable"\n}}\n';
    const result = formatWikitextDetailedResult(input);
    expect(result.formatted).toBe(input);
    expect(result.templateParameterDiagnostics.skipReasons).toMatchObject({
      "table opener is not represented by a balanced parser table node": 1,
    });
  });

  it("reports production template diagnostics", () => {
    const result = formatWikitextDetailedResult(
      "{{Template|a=1|nested={{Nested|x=1}}}}\n",
    );
    expect(result.templateParameterDiagnostics).toMatchObject({
      templatesInspected: 2,
      templatesEligible: 2,
      templatesChanged: 2,
      templatesAlreadyCanonical: 0,
      templatesSkippedAmbiguous: 0,
      uniqueTemplatesFormatted: 2,
      templatesFormatted: 2,
      templatesExpandedToMultiline: 1,
      templatesSkipped: 0,
      convergenceLimitReached: false,
    });
  });

  it("fails closed and reports a convergence limit", () => {
    const input = "{{T|a=1|b=2}}\n";
    const result = formatTemplatesWithDiagnostics(
      input,
      getParserConfig("mediawiki"),
      {
        lineWidth: 120,
        layout: "auto",
        parameterSpacing: true,
        maxPasses: 0,
      },
    );
    expect(result.formatted).toBe(input);
    expect(result.diagnostics.convergenceLimitReached).toBe(true);
    expect(result.diagnostics.skipReasons).toMatchObject({
      "did not converge within 0 passes": 1,
    });
  });

  it("is idempotent", () => {
    const once = formatWikitext("{{Template|a=1|c={{Nested|x=1|y=2}}}}\n");
    expect(formatWikitext(once)).toBe(once);
  });
});

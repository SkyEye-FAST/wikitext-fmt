import { describe, expect, it } from "vitest";

import {
  tableStructuralFingerprint,
  templateStructuralFingerprint,
} from "../src/equivalence.js";
import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";
import { formatTemplatesWithDiagnostics } from "../src/rules/templates.js";

const config = getParserConfig("mediawiki");

function anonymousValues(source: string): string[] {
  const template = parseWikitext(source, config).querySelector<{
    getAllArgs(): Array<{
      anon: boolean;
      lastChild: { toString(): string };
    }>;
  }>("template");
  return (
    template
      ?.getAllArgs()
      .filter((argument) => argument.anon)
      .map((argument) => argument.lastChild.toString()) ?? []
  );
}

function expectAnonymousLayout(input: string, expected: string): void {
  const result = formatWikitextSafeDetailed(input);
  expect(result.warning).toBeUndefined();
  expect(result.formatted).toBe(expected);
  expect(anonymousValues(result.formatted)).toEqual(anonymousValues(input));
  expect(templateStructuralFingerprint(result.formatted, config)).toBe(
    templateStructuralFingerprint(input, config),
  );
  expect(formatWikitextSafeDetailed(result.formatted).formatted).toBe(expected);
}

function expectEmbeddedTableLayout(input: string, expected: string): void {
  const result = formatWikitextSafeDetailed(input);
  expect(result.warning).toBeUndefined();
  expect(result.formatted).toBe(expected);
  expect(result.templateParameterDiagnostics.skipReasons).toEqual({});
  expect(tableStructuralFingerprint(result.formatted, config)).toBe(
    tableStructuralFingerprint(input, config),
  );
  expect(result.equivalenceDiagnostics.every((entry) => entry.equivalent)).toBe(
    true,
  );
  expect(formatWikitextSafeDetailed(result.formatted).formatted).toBe(expected);
}

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
    expect(formatWikitext("{{Template|a=b}}\n")).toBe("{{Template| a = b}}\n");
  });

  it("preserves meaningful trailing whitespace in anonymous values", () => {
    expectAnonymousLayout(
      "{{Template|one |named=value}}\n",
      "{{Template\n|one | named = value\n}}\n",
    );
  });

  it.each([
    ["plain", "{{T|foo}}\n"],
    ["leading space", "{{T| foo}}\n"],
    ["trailing space", "{{T|foo }}\n"],
    ["surrounding spaces", "{{T| foo }}\n"],
    ["leading tab", "{{T|\tfoo}}\n"],
  ])("preserves %s anonymous parameters byte-for-byte", (_name, input) => {
    expectAnonymousLayout(input, input);
  });

  it.each([
    ["all anonymous", "{{T|one|two|three}}\n", "{{T\n|one|two|three}}\n"],
    [
      "named then anonymous",
      "{{T|name=value|tail }}\n",
      "{{T\n| name = value\n|tail }}\n",
    ],
    [
      "anonymous then named",
      "{{T| head |name=value}}\n",
      "{{T\n| head | name = value\n}}\n",
    ],
    [
      "alternating named and anonymous",
      "{{T|one|a=1|two|b=2}}\n",
      "{{T\n|one| a = 1\n|two| b = 2\n}}\n",
    ],
    ["empty", "{{T||foo}}\n", "{{T\n||foo}}\n"],
    ["whitespace-only", "{{T| |foo}}\n", "{{T\n| |foo}}\n"],
    [
      "multiline",
      "{{T|first line\nsecond line}}\n",
      "{{T\n|first line\nsecond line}}\n",
    ],
    [
      "comments between positional arguments",
      "{{T|one<!-- between -->|two|three}}\n",
      "{{T\n|one<!-- between -->|two|three}}\n",
    ],
  ])(
    "formats %s parameters with an equivalent candidate",
    (_name, input, expected) => {
      expectAnonymousLayout(input, expected);
    },
  );

  it("normalizes only named arguments in a mixed template", () => {
    const input = "{{T| first | named = value |2= numeric |last }}\n";
    expectAnonymousLayout(
      input,
      "{{T\n| first | named = value\n| 2 = numeric\n|last }}\n",
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
    expect(result.formatted).toBe("{{T\n| {{Nested\n| a = 1\n| b = 2\n}} }}\n");
    expect(result.formatted).toContain("| {{Nested");
    expect(result.formatted).toContain("}} }}");
  });

  it("keeps an anonymous value immediately adjacent to the closing braces", () => {
    expectAnonymousLayout("{{T|tail}}\n", "{{T|tail}}\n");
  });

  it("formats a long positional template without changing either value", () => {
    const first = "a".repeat(80);
    const second = "b".repeat(80);
    expectAnonymousLayout(
      `{{T|${first}|${second}}}\n`,
      `{{T\n|${first}|${second}}}\n`,
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
      "<nowiki>{{Template\n| a=b\n}}</nowiki>\n<!-- wikitext-fmt-ignore-start -->\n{{Template\n| c=d\n}}\n<!-- wikitext-fmt-ignore-end -->\n";
    expect(formatWikitext(input)).toBe(input);
  });

  it("formats templates inside table cells", () => {
    const input = "{|\n| {{Template\n| a=b\n}}\n|}\n";
    expect(formatWikitext(input)).toContain("| a = b");
  });

  it("formats positional templates inside table cells", () => {
    expectEmbeddedTableLayout(
      "{|\n| {{T|one|two}} || tail\n|}\n",
      "{|\n| {{T\n|one|two}} \n| tail\n|}\n",
    );
  });

  it("treats a table in a positional parameter as opaque content", () => {
    expectEmbeddedTableLayout(
      "{{T|before|{|\n| A || B\n|}\n|after}}\n",
      "{{T\n|before|{|\n| A \n| B\n|}\n|after}}\n",
    );
  });

  it("preserves multiple tables and the text between them", () => {
    expectEmbeddedTableLayout(
      "{{Box|before|{|\n| A\n|}\ntext\n{|\n| B\n|}\n|after}}\n",
      "{{Box\n|before|{|\n| A\n|}\ntext\n{|\n| B\n|}\n|after}}\n",
    );
  });

  it("formats surrounding named parameters around nested tables", () => {
    expectEmbeddedTableLayout(
      "{{Box|content={|\n| outer\n{|\n| A || B\n|}\n| tail\n|}|note=value}}\n",
      "{{Box\n| content = {|\n| outer\n{|\n| A \n| B\n|}\n| tail\n|}\n| note = value\n}}\n",
    );
  });

  it("formats tables inside nested templates independently", () => {
    expectEmbeddedTableLayout(
      "{{Outer|one|nested={{Inner|{|\n| A || B\n|}\n}}|last}}\n",
      "{{Outer\n|one| nested = {{Inner\n|{|\n| A \n| B\n|}\n}}\n|last}}\n",
    );
  });

  it("keeps text before and after an embedded table in its named value", () => {
    expectEmbeddedTableLayout(
      "{{Box|content=before\n{|\n| A || B\n|}\nafter|note=value}}\n",
      "{{Box\n| content = before\n{|\n| A \n| B\n|}\nafter\n| note = value\n}}\n",
    );
  });

  it("formats nested templates deepest-first", () => {
    const input =
      "{{Outer|safe=value|nested={{Nested|x=1|y=2}}|parser={{#if:x|y|z}}}}\n";
    const result = formatWikitextDetailedResult(input);
    expect(result.formatted).toContain("{{Nested\n| x = 1\n| y = 2\n}}");
    expect(result.formatted).toContain("{{#if:x|y|z}}");
    expect(result.templateParameterDiagnostics.templatesFormatted).toBe(2);
    expect(
      result.templateParameterDiagnostics.formattingPassesUsed,
    ).toBeGreaterThan(1);
  });

  it("fails closed on a table opener the parser cannot balance", () => {
    const input = '{{Template\n| a = {| class="wikitable"\n}}\n';
    const result = formatWikitextDetailedResult(input);
    expect(result.formatted).toBe(input);
    expect(result.templateParameterDiagnostics.skipReasons).toMatchObject({
      "table opener is not represented by a balanced parser table node": 1,
    });
  });

  it("does not mistake a safesubst triple-brace default for a table opener", () => {
    const input = "{{ {{{|safesubst:}}}#if:{{{1|}}}|yes|no }}\n";
    const result = formatWikitextDetailedResult(input);
    expect(result.formatted).toBe(input);
    expect(result.templateParameterDiagnostics.skipReasons).toEqual({});
    expect(result.templateParameterDiagnostics.templatesSkippedAmbiguous).toBe(
      0,
    );
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
    const diagnostics = result.templateParameterDiagnostics;
    expect(new Set(diagnostics.templateSemanticIds).size).toBe(
      diagnostics.templatesInspected,
    );
    expect(new Set(diagnostics.changedTemplateSemanticIds).size).toBe(
      diagnostics.templatesChanged,
    );
    expect(
      diagnostics.changedTemplateSemanticIds.every((id) =>
        diagnostics.templateSemanticIds.includes(id),
      ),
    ).toBe(true);
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

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
import type {
  FormatOptions,
  InlineTemplateSpacing,
  TemplateParameterLayout,
} from "../src/options.js";

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

function expectInlineLayout(
  input: string,
  expected: string,
  options: FormatOptions = {},
): void {
  const result = formatWikitextSafeDetailed(input, options);
  expect(result.warning).toBeUndefined();
  expect(result.formatted).toBe(expected);
  expect(parseWikitext(result.formatted, config).toString()).toBe(
    result.formatted,
  );
  expect(templateStructuralFingerprint(result.formatted, config)).toBe(
    templateStructuralFingerprint(input, config),
  );
  expect(formatWikitextSafeDetailed(result.formatted, options).formatted).toBe(
    expected,
  );
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
    expectInlineLayout("{{Template|a=b}}\n", "{{Template|a=b}}\n");
  });

  it.each([
    ["compact", "{{a| b = 1}}\n", "{{a|b=1}}\n"],
    ["spaced", "{{a|b=1}}\n", "{{ a | b = 1 }}\n"],
  ] as const)("supports explicit %s inline spacing", (spacing, input, expected) => {
    expectInlineLayout(input, expected, {
      inlineTemplateSpacing: spacing,
    });
  });

  it.each([
    ["already compact", "{{a|b=1}}\n", "{{a|b=1}}\n"],
    ["already spaced", "{{ a | b = 1 }}\n", "{{ a | b = 1 }}\n"],
    ["spaced internals", "{{a| b = 1}}\n", "{{ a | b = 1 }}\n"],
    ["compact internals", "{{ a|b=1 }}\n", "{{a|b=1}}\n"],
    [
      "multiple spaced internals",
      "{{a| b = 1| c = 2}}\n",
      "{{ a | b = 1 | c = 2 }}\n",
    ],
    [
      "multiple compact internals",
      "{{ a|b=1|c=2 }}\n",
      "{{a|b=1|c=2}}\n",
    ],
    ["compact majority", "{{a|b = 1|c=2}}\n", "{{a|b=1|c=2}}\n"],
    ["deterministic tie", "{{ a|b = 1}}\n", "{{a|b=1}}\n"],
  ] as const)("infers %s in auto mode", (_name, input, expected) => {
    expectInlineLayout(input, expected, {
      level: "experimental",
      formatTemplates: false,
      formatTemplateParameters: true,
      inlineTemplateSpacing: "auto",
    });
  });

  it.each([
    [
      "compact",
      "{{a\n|b=c\n|d=e\n}}\n",
    ],
    [
      "flush",
      "{{a\n| b = c\n| d = e\n}}\n",
    ],
    [
      "indented",
      "{{a\n | b = c\n | d = e\n}}\n",
    ],
  ] as const)("supports the %s named-parameter layout", (layout, expected) => {
    const input = "{{a|b=c|d=e}}\n";
    for (const inlineTemplateSpacing of [
      "auto",
      "compact",
      "spaced",
    ] as const) {
      const result = formatWikitextSafeDetailed(input, {
        templateParameterLayout: layout,
        inlineTemplateSpacing,
      });
      expect(result.warning).toBeUndefined();
      expect(result.formatted).toBe(expected);
      expect(
        formatWikitextSafeDetailed(result.formatted, {
          templateParameterLayout: layout,
          inlineTemplateSpacing,
        }).formatted,
      ).toBe(expected);
    }
  });

  it.each([
    "compact",
    "flush",
    "indented",
  ] as const)(
    "keeps inline spacing independent of the %s multiline layout",
    (templateParameterLayout) => {
      expectInlineLayout("{{a| b = 1}}\n", "{{ a | b = 1 }}\n", {
        templateParameterLayout,
        inlineTemplateSpacing: "spaced",
      });
    },
  );

  it.each([
    ["compact", "{{a|1=x|2=y}}\n"],
    ["spaced", "{{ a | 1 = x | 2 = y }}\n"],
  ] as const)(
    "formats explicitly numbered inline parameters as %s",
    (inlineTemplateSpacing, expected) => {
      expectInlineLayout("{{a|1=x|2=y}}\n", expected, {
        level: "experimental",
        formatTemplates: false,
        formatTemplateParameters: true,
        inlineTemplateSpacing,
      });
    },
  );

  it.each([
    ["auto", "{{Lang|ja|シエラ}}\n"],
    ["compact", "{{Lang|ja|シエラ}}\n"],
    ["spaced", "{{Lang|ja|シエラ}}\n"],
  ] as const)(
    "does not apply %s named-template spacing to anonymous parameters",
    (inlineTemplateSpacing, expected) => {
      expectAnonymousLayout("{{Lang|ja|シエラ}}\n", expected);
      const result = formatWikitextSafeDetailed(expected, {
        inlineTemplateSpacing,
      });
      expect(result.formatted).toBe(expected);
      expect(anonymousValues(result.formatted)).toEqual(["ja", "シエラ"]);
    },
  );

  it.each([
    "auto",
    "compact",
    "spaced",
  ] as readonly InlineTemplateSpacing[])(
    "keeps mixed anonymous values safe in %s mode",
    (inlineTemplateSpacing) => {
      const cases = [
        ["{{a|foo|name=bar}}\n", "{{a|foo|name=bar}}\n", ["foo"]],
        ["{{a| foo |name=bar}}\n", "{{a| foo |name=bar}}\n", [" foo "]],
        ["{{ a|\tfoo| name = bar }}\n", "{{a|\tfoo|name=bar}}\n", ["\tfoo"]],
      ] as const;
      for (const [input, expected, expectedAnonymousValues] of cases) {
        const result = formatWikitextSafeDetailed(input, {
          inlineTemplateSpacing,
        });
        expect(result.warning).toBeUndefined();
        expect(result.formatted).toBe(expected);
        expect(anonymousValues(result.formatted)).toEqual(
          expectedAnonymousValues,
        );
        expect(templateStructuralFingerprint(result.formatted, config)).toBe(
          templateStructuralFingerprint(input, config),
        );
        expect(
          formatWikitextSafeDetailed(result.formatted, {
            inlineTemplateSpacing,
          }).formatted,
        ).toBe(expected);
      }
    },
  );

  it.each([
    "compact",
    "flush",
    "indented",
  ] as readonly TemplateParameterLayout[])(
    "uses auto inline inference independently from %s layout",
    (templateParameterLayout) => {
      expectInlineLayout("{{ a|b=1 }}\n", "{{a|b=1}}\n", {
        templateParameterLayout,
      });
    },
  );

  it("collapses a short multiline anonymous template without changing values", () => {
    expectAnonymousLayout(
      "{{Lang\n|ja|シエラ}}\n",
      "{{Lang|ja|シエラ}}\n",
    );
  });

  it("preserves meaningful trailing whitespace in anonymous values", () => {
    expectAnonymousLayout(
      "{{Template|one |named=value}}\n",
      "{{Template|one |named=value}}\n",
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
    ["all anonymous", "{{T|one|two|three}}\n", "{{T|one|two|three}}\n"],
    [
      "named then anonymous",
      "{{T|name=value|tail }}\n",
      "{{T|name=value|tail }}\n",
    ],
    [
      "anonymous then named",
      "{{T| head |name=value}}\n",
      "{{T| head |name=value}}\n",
    ],
    [
      "alternating named and anonymous",
      "{{T|one|a=1|two|b=2}}\n",
      "{{T|one|a=1|two|b=2}}\n",
    ],
    ["empty", "{{T||foo}}\n", "{{T||foo}}\n"],
    ["whitespace-only", "{{T| |foo}}\n", "{{T| |foo}}\n"],
    [
      "multiline",
      "{{T|first line\nsecond line}}\n",
      "{{T|first line\nsecond line}}\n",
    ],
    [
      "comments between positional arguments",
      "{{T|one<!-- between -->|two|three}}\n",
      "{{T|one<!-- between -->|two|three}}\n",
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
      "{{T| first |named=value|2=numeric|last }}\n",
    );
  });

  it("keeps explicit numeric parameters named", () => {
    const result = formatWikitextSafeDetailed("{{T|1= first |2= second }}\n");
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(
      "{{T\n| 1 = first\n| 2 = second\n}}\n",
    );
  });

  it("preserves anonymous whitespace around a formatted nested template", () => {
    const input = "{{T| {{Nested|a=1|b=2}} }}\n";
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(
      "{{T| {{Nested\n| a = 1\n| b = 2\n}} }}\n",
    );
    expect(result.formatted).toContain("| {{Nested");
    expect(result.formatted).toContain("}} }}");
  });

  it("does not collapse a multiline anonymous template with nested structure", () => {
    const input = "{{T\n|{{Nested|x=1|y=2}}|tail}}\n";
    const expected = "{{T\n|{{Nested\n| x = 1\n| y = 2\n}}|tail}}\n";
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(expected);
    expect(anonymousValues(result.formatted)).toEqual([
      "{{Nested\n| x = 1\n| y = 2\n}}",
      "tail",
    ]);
    expect(templateStructuralFingerprint(result.formatted, config)).toBe(
      templateStructuralFingerprint(input, config),
    );
    expect(formatWikitextSafeDetailed(result.formatted).formatted).toBe(expected);
  });

  it("keeps an anonymous value immediately adjacent to the closing braces", () => {
    expectAnonymousLayout("{{T|tail}}\n", "{{T|tail}}\n");
  });

  it("formats a long positional template without changing either value", () => {
    const first = "a".repeat(80);
    const second = "b".repeat(80);
    expectAnonymousLayout(
      `{{T|${first}|${second}}}\n`,
      `{{T|${first}|${second}}}\n`,
    );
  });

  it("treats line width as soft for anonymous parameters", () => {
    const input =
      "{{Lang\n|ja|a very long value that cannot reasonably stay inline}}\n";
    const expected =
      "{{Lang|ja|a very long value that cannot reasonably stay inline}}\n";
    const result = formatWikitextSafeDetailed(input, { lineWidth: 20 });
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(expected);
    expect(anonymousValues(result.formatted)).toEqual(anonymousValues(input));
    expect(
      formatWikitextSafeDetailed(result.formatted, { lineWidth: 20 }).formatted,
    ).toBe(expected);
  });

  it("preserves multiline anonymous parameter whitespace exactly", () => {
    const input = "{{T\n| first\n|second\n}}\n";
    expectAnonymousLayout(input, input);
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
      "{|\n| {{T|one|two}} \n| tail\n|}\n",
    );
  });

  it("treats a table in a positional parameter as opaque content", () => {
    expectEmbeddedTableLayout(
      "{{T|before|{|\n| A || B\n|}\n|after}}\n",
      "{{T|before|{|\n| A \n| B\n|}\n|after}}\n",
    );
  });

  it("preserves multiple tables and the text between them", () => {
    expectEmbeddedTableLayout(
      "{{Box|before|{|\n| A\n|}\ntext\n{|\n| B\n|}\n|after}}\n",
      "{{Box|before|{|\n| A\n|}\ntext\n{|\n| B\n|}\n|after}}\n",
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
      "{{Outer|one|nested={{Inner|{|\n| A \n| B\n|}\n}}|last}}\n",
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
    expect(result.formatted).toContain(
      "{{Nested\n| x = 1\n| y = 2\n}}",
    );
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
      templatesChanged: 1,
      templatesAlreadyCanonical: 1,
      templatesSkippedAmbiguous: 0,
      uniqueTemplatesFormatted: 1,
      templatesFormatted: 1,
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
        inlineTemplateSpacing: "auto",
        parameterLayout: "flush",
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

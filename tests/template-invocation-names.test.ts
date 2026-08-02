import { describe, expect, it } from "vitest";

import {
  templateStructuralFingerprint,
  verifyStructuralEquivalence,
} from "../src/equivalence.js";
import {
  formatWikitext,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import { resolveOptions } from "../src/options.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";

const config = getParserConfig("mediawiki");

function expectStableFormatting(input: string, expected: string): void {
  const result = formatWikitextSafeDetailed(input);
  expect(result.warning).toBeUndefined();
  expect(result.formatted).toBe(expected);
  expect(parseWikitext(result.formatted, config).toString()).toBe(
    result.formatted,
  );
  expect(templateStructuralFingerprint(result.formatted, config)).toBe(
    templateStructuralFingerprint(input, config),
  );
  expect(result.equivalenceDiagnostics.every((entry) => entry.equivalent)).toBe(
    true,
  );
  expect(formatWikitextSafeDetailed(result.formatted).formatted).toBe(expected);
}

describe("ordinary template invocation names", () => {
  it.each([
    ["without parameters", "{{a_b_c}}\n", "{{a b c}}\n"],
    ["with a named parameter", "{{a_b_c|x=1}}\n", "{{a b c|x=1}}\n"],
    [
      "with spaced inline layout",
      "{{ a_b_c | x = 1 }}\n",
      "{{ a b c | x = 1 }}\n",
    ],
    ["with an explicit namespace", "{{Template:a_b_c}}\n", "{{Template:a b c}}\n"],
    ["with a leading colon", "{{:Main_Page}}\n", "{{:Main Page}}\n"],
    ["with a subpage", "{{a_b/c_d}}\n", "{{a b/c d}}\n"],
    ["with adjacent underscores", "{{a__b}}\n", "{{a  b}}\n"],
  ])("normalizes underscores %s", (_name, input, expected) => {
    expectStableFormatting(input, expected);
  });

  it.each([
    ["subst", "{{subst:a_b_c}}\n", "{{subst:a b c}}\n"],
    [
      "safesubst",
      "{{safesubst:a_b_c|x=1}}\n",
      "{{safesubst:a b c|x=1}}\n",
    ],
    ["modifier casing", "{{SuBsT:a_b}}\n", "{{SuBsT:a b}}\n"],
  ])("preserves the %s modifier", (_name, input, expected) => {
    expectStableFormatting(input, expected);
  });

  it.each([
    [
      "named parameter content",
      "{{a_b|parameter_name=value_with_underscore}}\n",
      "{{a b|parameter_name=value_with_underscore}}\n",
    ],
    [
      "explicit numeric parameter content",
      "{{a_b|1=anonymous_like_value}}\n",
      "{{a b|1=anonymous_like_value}}\n",
    ],
    [
      "anonymous parameter content",
      "{{a_b|anonymous_value}}\n",
      "{{a b|anonymous_value}}\n",
    ],
    [
      "nested ordinary invocation names",
      "{{a_b|value={{nested_template}}}}\n",
      "{{a b|value={{nested template}}}}\n",
    ],
  ])("preserves %s", (_name, input, expected) => {
    expectStableFormatting(input, expected);
  });

  it.each([
    ["if", "{{#if:a_b|yes|no}}\n"],
    ["ifeq", "{{#ifeq:a_b|a_b|yes|no}}\n"],
    ["switch", "{{#switch:a_b|a_b=yes}}\n"],
    ["invoke", "{{#invoke:module_name|function_name}}\n"],
    ["expr", "{{#expr:a_b}}\n"],
    ["PAGENAME", "{{PAGENAME}}\n"],
    ["CURRENT_DAY", "{{CURRENT_DAY}}\n"],
    ["FULLPAGENAMEE", "{{FULLPAGENAMEE}}\n"],
    ["table-pipe magic word", "{{!}}\n"],
    ["triple-brace parameter", "{{{parameter_name}}}\n"],
    [
      "triple-brace parameter default",
      "{{{parameter_name|default_value}}}\n",
    ],
  ])("does not rewrite %s", (_name, input) => {
    expectStableFormatting(input, input);
  });

  it("formats a nested ordinary name without rewriting its dynamic outer name", () => {
    const input = "{{{{template_name}}|x=1}}\n";
    const expected = "{{{{template name}}|x=1}}\n";
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(expected);
    expect(result.templateDiagnostics.skipReasons).toMatchObject({
      "dynamic template name": 1,
    });
    expect(templateStructuralFingerprint(result.formatted, config)).toBe(
      templateStructuralFingerprint(input, config),
    );
    expect(formatWikitextSafeDetailed(expected).formatted).toBe(expected);
  });

  it("fails closed on a structurally composed invocation title", () => {
    const input = "{{prefix_{{value}}|x=1}}\n";
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
    expect(result.templateDiagnostics.skipReasons).toMatchObject({
      "dynamic template name": 1,
    });
    expect(formatWikitextSafeDetailed(result.formatted).formatted).toBe(input);
  });

  it("keeps title normalization behind the existing template formatter", () => {
    const input = "{{a_b|x=1}}\n";
    expect(
      formatWikitext(input, {
        formatTemplates: false,
      }),
    ).toBe(input);
  });

  it("preserves unrelated underscore-bearing syntax and prose", () => {
    const input = [
      "ordinary_prose",
      "[[Page_Name|label_with_underscore]]",
      '<span data_name="value_with_underscore">html_text</span>',
    ].join("\n");
    expect(
      formatWikitext(input, {
        formatWikilinks: false,
      }),
    ).toBe(input);
  });

  it("retains multiline layout while normalizing the invocation title", () => {
    expectStableFormatting(
      "{{a_b\n| x = 1\n| y = 2\n}}\n",
      "{{a b\n| x = 1\n| y = 2\n}}\n",
    );
  });

  it("normalizes ordinary titles without weakening parameter equivalence", () => {
    const options = resolveOptions({});
    expect(
      verifyStructuralEquivalence(
        "{{a_b|x=1}}",
        "{{a b|x=1}}",
        config,
        "templates",
      ),
    ).toEqual({ equivalent: true, structure: "templates" });
    expect(
      verifyStructuralEquivalence(
        "{{a_b|parameter_name=value_with_underscore}}",
        "{{a b|parameter_name=value_with_underscore}}",
        config,
        "document",
        options,
      ),
    ).toEqual({ equivalent: true, structure: "document" });
    expect(
      verifyStructuralEquivalence(
        "{{a_b|parameter_name=value_with_underscore}}",
        "{{a b|parameter name=value_with_underscore}}",
        config,
        "document",
        options,
      ),
    ).toMatchObject({ equivalent: false, structure: "document" });
    expect(
      verifyStructuralEquivalence(
        "{{a_b|parameter_name=value_with_underscore}}",
        "{{a b|parameter_name=value with underscore}}",
        config,
        "document",
        options,
      ),
    ).toMatchObject({ equivalent: false, structure: "document" });
    expect(
      verifyStructuralEquivalence(
        "{{#if:a_b|yes|no}}",
        "{{#if:a b|yes|no}}",
        config,
        "document",
        options,
      ),
    ).toMatchObject({ equivalent: false, structure: "document" });
    expect(
      verifyStructuralEquivalence(
        "{{prefix_{{value}}|x=1}}",
        "{{prefix {{value}}|x=1}}",
        config,
        "templates",
      ),
    ).toMatchObject({ equivalent: false, structure: "templates" });
    expect(
      verifyStructuralEquivalence(
        "{{{{template_name}}|x=1}}",
        "{{{{template name}}|x=1}}",
        config,
        "templates",
      ),
    ).toEqual({ equivalent: true, structure: "templates" });
  });

  it("formats eligible calls in ordinary structural contexts", () => {
    const input = [
      "Prose {{prose_name}}.",
      "== Heading {{heading_name}} ==",
      "* {{list_name}}",
      "{|",
      "| {{cell_name}}",
      "|}",
      "{{outer_name|value={{inner_name}}}}",
    ].join("\n");
    const result = formatWikitextSafeDetailed(input);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toContain("Prose {{prose name}}.");
    expect(result.formatted).toContain("== Heading {{heading name}} ==");
    expect(result.formatted).toContain("* {{list name}}");
    expect(result.formatted).toContain("| {{cell name}}");
    expect(result.formatted).toContain(
      "{{outer name|value={{inner name}}}}",
    );
    expect(formatWikitextSafeDetailed(result.formatted).formatted).toBe(
      result.formatted,
    );
  });

  it("preserves protected regions", () => {
    const input = [
      "<nowiki>{{nowiki_name}}</nowiki>",
      "<pre>{{pre_name}}</pre>",
      "<source>{{source_name}}</source>",
      "<!-- {{comment_name}} -->",
      "<ref>{{reference_name}}</ref>",
    ].join("\n");
    expectStableFormatting(input, input);
  });
});

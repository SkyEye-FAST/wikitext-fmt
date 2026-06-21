import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";

const options = {
  level: "experimental" as const,
  formatTemplateParameters: true,
};

describe("experimental multiline template parameter formatting", () => {
  it("is disabled by default", () => {
    const input = "{{Template\n| a=b\n| c = d\n}}\n";
    expect(formatWikitext(input)).toBe(input);
  });

  it("requires experimental level and explicit option", () => {
    const input = "{{Template\n| a=b\n}}\n";
    expect(formatWikitext(input, { formatTemplateParameters: true })).toBe(
      input,
    );
    expect(formatWikitext(input, { level: "experimental" })).toBe(input);
  });

  it("normalizes simple named parameter spacing", () => {
    const input =
      "{{Template   \n| a=b   \n| c =d\n| d= value\n| empty=   \n}}\n";
    expect(formatWikitext(input, options)).toBe(
      "{{Template\n| a = b\n| c = d\n| d = value\n| empty = \n}}\n",
    );
  });

  it("preserves single-line templates", () => {
    const input = "{{Template|a=b}}\n";
    expect(formatWikitext(input, options)).toBe(input);
  });

  it.each([
    "{{Template\n| a = {{Nested|x=1}}\n}}\n",
    "{{Template\n| a = {{#if:x|y|z}}\n}}\n",
    '{{Template\n| a = {| class="wikitable"\n}}\n',
    "{{Template\n| a = * item\n}}\n",
    "{{Template\n| a = <ref>source</ref>\n}}\n",
    "{{Template\n| a = [[Page|label]]\n}}\n",
    "{{Template\n| a = value <!-- comment -->\n}}\n",
    "{{Template\n| 1 = positional\n}}\n",
  ])("preserves unsafe template parameter line %s", (input) => {
    expect(formatWikitext(input, options)).toBe(input);
  });

  it("preserves multiline values conservatively", () => {
    const input = "{{Template\n| a = first line\nsecond line\n| b=c\n}}\n";
    expect(formatWikitext(input, options)).toBe(
      "{{Template\n| a = first line\nsecond line\n| b = c\n}}\n",
    );
  });

  it("formats later safe parameters after multiline values", () => {
    const input =
      "{{Template\n| first = line one\nline two\n| 中文 =值\n| 日本語= 値\n}}\n";
    expect(formatWikitext(input, options)).toBe(
      "{{Template\n| first = line one\nline two\n| 中文 = 值\n| 日本語 = 値\n}}\n",
    );
  });

  it("preserves protected blocks and comments containing template braces", () => {
    const input =
      '<nowiki>{{Template\n| a=b\n}}</nowiki>\n<pre>{{Template\n| c=d\n}}</pre>\n<syntaxhighlight lang="wikitext">{{Template\n| e=f\n}}</syntaxhighlight>\n<!-- {{Template\n| g=h\n}} -->\n';
    expect(formatWikitext(input, options)).toBe(input);
  });

  it("preserves table content containing template braces", () => {
    const input = "{|\n| {{Template\n| a=b\n}}\n|}\n";
    expect(formatWikitext(input, options)).toBe(input);
  });

  it.each([
    "{{Template\n| safe=value\n| nested = {{Nested|x=1}}\n| later = value\n}}\n",
    "{{Template\n| safe=value\n| parser = {{#if:x|y|z}}\n| later = value\n}}\n",
  ])("skips blocks containing nested template syntax %s", (input) => {
    expect(formatWikitext(input, options)).toBe(input);
  });

  it("is idempotent", () => {
    const once = formatWikitext("{{Template\n| a=b\n| c = d\n}}\n", options);
    expect(formatWikitext(once, options)).toBe(once);
  });

  it("reports template parameter diagnostics", () => {
    const result = formatWikitextDetailedResult(
      "{{Template\n| a=b\n| unsafe = [[Page|label]]\n}}\n",
      options,
    );
    expect(result.templateParameterDiagnostics).toEqual({
      templateParametersFormatted: 1,
      templateParameterLinesFormatted: 1,
      templateParameterLinesSkippedUnsafe: 1,
    });
  });
});

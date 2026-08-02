import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafe,
  ruleLevels,
} from "../src/index.js";
import type { FormatOptions } from "../src/index.js";
import { resolveOptions } from "../src/options.js";

describe("formatter API", () => {
  it("is idempotent", () => {
    const input = "==Title==\n{{Foo|a=1|b=2}}\n[[Category:A]]\n";
    const once = formatWikitext(input);
    expect(formatWikitext(once)).toBe(once);
  });

  it("falls back safely without throwing", () => {
    const input = "==Title==\n";
    const result = formatWikitextSafe(input, {
      parserConfig: "missing-parser-config",
    });
    expect(result.formatted).toBe(input);
    expect(result.failure).toMatchObject({
      code: "formatter-exception",
      stage: "safe-formatting",
    });
    expect(result.warning).toMatch(/Safe formatting failed/u);
  });

  it("safe formatting returns parseable, idempotent output", () => {
    const result = formatWikitextSafe("==Title==\n{{Foo|a=1}}\n");
    expect(result.warning).toBeUndefined();
    expect(formatWikitext(result.formatted)).toBe(result.formatted);
  });

  it("safe level excludes normal rules", () => {
    const input = "==Title==\n{{Foo|a=1}}\nText\n[[Category:A]]\n";
    expect(formatWikitext(input, { level: "safe" })).toBe(
      "== Title ==\n{{Foo|a=1}}\nText\n[[Category:A]]\n",
    );
  });

  it("publishes the reliability level of every rule", () => {
    expect(ruleLevels).toEqual({
      headings: "safe",
      blankLines: "safe",
      templates: "normal",
      categories: "normal",
      lists: "normal",
      fileLinks: "normal",
      wikilinks: "normal",
      externalLinks: "normal",
      references: "normal",
      interlanguageLinks: "experimental",
      sectionSpacing: "normal",
      redirects: "normal",
      behaviorSwitches: "normal",
      htmlVoidTags: "safe",
      tables: "normal",
    });
  });

  it("exposes only the unified template API", () => {
    const options: FormatOptions = {
      formatTemplates: true,
      inlineTemplateSpacing: "compact",
      templateParameterLayout: "flush",
    };
    const result = formatWikitextDetailedResult(
      "{{ T | a = 1 | b = 2 }}\n",
      options,
    );
    const removedResultField = ["templateParameter", "Diagnostics"].join("");
    const removedRule = ["template", "Parameters"].join("");

    expect(result.templateDiagnostics.uniqueTemplatesFormatted).toBe(1);
    expect(result).not.toHaveProperty(removedResultField);
    expect(ruleLevels).not.toHaveProperty(removedRule);
  });

  it("enables aggressive tables by default and supports an explicit opt-out", () => {
    const input = '{| class="wikitable"\n! A !! B\n|}\n';
    expect(formatWikitext(input)).toBe('{| class="wikitable"\n! A\n! B\n|}\n');
    expect(formatWikitext(input, { formatTables: false })).toBe(input);
  });

  it("keeps production and aggressive profiles distinct with explicit overrides", () => {
    expect(resolveOptions({ profile: "production" })).toMatchObject({
      level: "normal",
      formatTemplates: true,
      formatTables: true,
      formatReferences: true,
      formatExternalLinks: true,
      formatSectionSpacing: true,
      formatInterlanguageLinks: false,
      interlanguagePlacement: "preserve",
    });
    expect(resolveOptions({ profile: "aggressive" })).toMatchObject({
      level: "experimental",
      formatTemplates: true,
      formatTables: true,
      formatReferences: true,
      formatExternalLinks: true,
      formatSectionSpacing: true,
      formatInterlanguageLinks: true,
      interlanguagePlacement: "footer",
    });
    expect(
      resolveOptions({ profile: "aggressive", formatReferences: false }),
    ).toMatchObject({ profile: "aggressive", formatReferences: false });

    const input = '<ref name="x"/>\nParagraph\n==Title==\nNext\n';
    expect(formatWikitext(input, { profile: "production" })).toBe(
      '<ref name="x" />\nParagraph\n\n== Title ==\n\nNext\n',
    );
    expect(formatWikitext(input, { profile: "aggressive" })).toBe(
      '<ref name="x" />\nParagraph\n\n== Title ==\n\nNext\n',
    );

    const interlanguage = "[[en:Example]]\nBody\n";
    expect(formatWikitext(interlanguage, { profile: "production" })).toBe(
      interlanguage,
    );
    expect(formatWikitext(interlanguage, { profile: "aggressive" })).toBe(
      "Body\n\n[[en:Example]]\n",
    );
  });

  it("formats parser-confirmed indented tables", () => {
    const input = '  {| class="wikitable"\n| A || B\n|}\n';
    expect(
      formatWikitext(input, { formatTables: true, level: "experimental" }),
    ).toBe('  {| class="wikitable"\n| A\n| B\n|}\n');
  });

  it("preserves HTML void tag syntax in preserve mode", () => {
    const input = "Before<br />after<hr>\n";
    expect(formatWikitext(input, { htmlVoidTagStyle: "preserve" })).toBe(input);
  });

  it("uses XHTML syntax when requested", () => {
    expect(
      formatWikitext("Before<br>middle<br/>after\n", {
        htmlVoidTagStyle: "xhtml",
      }),
    ).toBe("Before<br />middle<br />after\n");
  });

  it("can disable individual rules", () => {
    expect(formatWikitext("==Title==\n", { formatHeadings: false })).toBe(
      "==Title==\n",
    );
  });

  it("formats CRLF input and preserves its line endings", () => {
    const input = "==Title==\r\nText\r\n";
    const result = formatWikitextSafe(input);
    expect(result.formatted).toBe("== Title ==\r\nText\r\n");
    expect(result.failure).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(formatWikitext(result.formatted)).toBe(result.formatted);
  });
});

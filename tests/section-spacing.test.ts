import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import { formatSectionSpacing } from "../src/rules/sectionSpacing.js";

const options = {
  level: "experimental" as const,
  formatSectionSpacing: true,
};
const config = getParserConfig("mediawiki");

describe("experimental section spacing", () => {
  it("is disabled by default", () => {
    const input = "Intro\n==Title==\nText\n";
    expect(formatWikitext(input)).toBe("Intro\n== Title ==\nText\n");
  });

  it("adds one blank line before and after headings near ordinary paragraphs", () => {
    expect(formatWikitext("Intro\n==Title==\nText\n", options)).toBe(
      "Intro\n\n== Title ==\n\nText\n",
    );
  });

  it("adds one blank line after a heading followed by an ordinary paragraph", () => {
    expect(formatSectionSpacing("== A ==\nText\n").formatted).toBe(
      "== A ==\n\nText\n",
    );
  });

  it("uses parser-confirmed heading nodes when context is provided", () => {
    const source = "Intro\n== A ==\nText\n";
    expect(
      formatSectionSpacing(source, createParserContext(source, config))
        .formatted,
    ).toBe("Intro\n\n== A ==\n\nText\n");
  });

  it("ignores a stale section-spacing parser context for a different source", () => {
    const source = "Intro\n== A ==\nText\n";
    expect(
      formatSectionSpacing(source, createParserContext("Plain text\n", config))
        .formatted,
    ).toBe("Intro\n\n== A ==\n\nText\n");
  });

  it("does not treat parser level-1 headings as section-spacing headings", () => {
    const source = "Intro\n= Not a section =\nText\n";
    expect(
      formatSectionSpacing(source, createParserContext(source, config))
        .formatted,
    ).toBe(source);
  });

  it("adds one blank line before a heading after an ordinary paragraph", () => {
    expect(formatSectionSpacing("Intro\n== A ==\n").formatted).toBe(
      "Intro\n\n== A ==\n",
    );
  });

  it("keeps existing blank lines around headings stable", () => {
    const input = "Intro\n\n== A ==\n\nText\n";
    const once = formatSectionSpacing(input).formatted;
    expect(once).toBe(input);
    expect(formatSectionSpacing(once).formatted).toBe(once);
  });

  it("does not add a blank line at the start of the file", () => {
    expect(formatWikitext("==Title==\nText\n", options)).toBe(
      "== Title ==\n\nText\n",
    );
  });

  it("preserves consecutive headings", () => {
    expect(formatWikitext("==A==\n===B===\nText\n", options)).toBe(
      "== A ==\n=== B ===\n\nText\n",
    );
  });

  it.each([
    "{{Infobox}}\n==Title==\nText\n",
    "* Item\n==Title==\nText\n",
    "{|\n| A\n|}\n==Title==\nText\n",
    "[[Category:A]]\n==Title==\nText\n",
  ])("preserves risky spacing context %s", (input) => {
    const output = formatWikitext(input, options);
    expect(output).not.toContain("\n\n== Title ==");
  });

  it.each([
    ["template", "{{Infobox}}"],
    ["table start", "{|"],
    ["table end", "|}"],
    ["list", "* Item"],
    ["category", "[[Category:A]]"],
    ["file link", "[[File:A.png|thumb]]"],
    ["HTML tag", "<span>Text</span>"],
    ["extension tag", "<ref>Text</ref>"],
    ["comment", "<!-- comment -->"],
    ["behavior switch", "__NOTOC__"],
  ])("does not insert spacing before a heading after %s", (_name, risky) => {
    expect(formatSectionSpacing(`${risky}\n== A ==\n`).formatted).toBe(
      `${risky}\n== A ==\n`,
    );
  });

  it.each([
    ["template", "{{Infobox}}"],
    ["table start", "{|"],
    ["table end", "|}"],
    ["list", "* Item"],
    ["category", "[[Category:A]]"],
    ["file link", "[[File:A.png|thumb]]"],
    ["HTML tag", "<span>Text</span>"],
    ["extension tag", "<ref>Text</ref>"],
    ["comment", "<!-- comment -->"],
    ["behavior switch", "__NOTOC__"],
  ])("does not insert spacing after a heading before %s", (_name, risky) => {
    expect(formatSectionSpacing(`== A ==\n${risky}\n`).formatted).toBe(
      `== A ==\n${risky}\n`,
    );
  });

  it("can be explicitly disabled", () => {
    expect(
      formatWikitext("Intro\n==Title==\nText\n", {
        level: "experimental",
        formatSectionSpacing: false,
      }),
    ).toBe("Intro\n== Title ==\nText\n");
  });

  it("reports inserted spacing diagnostics", () => {
    const result = formatWikitextDetailedResult(
      "Intro\n==Title==\nText\n",
      options,
    );
    expect(result.sectionSpacingDiagnostics).toEqual({
      sectionSpacingBeforeHeadingsInserted: 1,
      sectionSpacingAfterHeadingsInserted: 1,
    });
  });

  it("uses the current source snapshot after heading formatting changes text", () => {
    expect(formatWikitext("Intro\n==Title==\nText\n", options)).toBe(
      "Intro\n\n== Title ==\n\nText\n",
    );
  });
});

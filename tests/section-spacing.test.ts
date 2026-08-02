import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafe,
} from "../src/index.js";
import { createNodeParserSession, getParserConfig } from "../src/parser.js";
import { formatSectionSpacing } from "../src/rules/sectionSpacing.js";

const options = {
  level: "normal" as const,
  formatSectionSpacing: true,
};
const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);

describe("section spacing", () => {
  it("remains disabled by the default profile", () => {
    const input = "Intro\n==Title==\nText\n";
    expect(formatWikitext(input)).toBe("Intro\n== Title ==\nText\n");
  });

  it("runs at normal level but not safe level", () => {
    const input = "Intro\n==Title==\nText\n";
    expect(formatWikitext(input, options)).toBe(
      "Intro\n\n== Title ==\n\nText\n",
    );
    expect(
      formatWikitext(input, {
        level: "safe",
        formatSectionSpacing: true,
      }),
    ).toBe("Intro\n== Title ==\nText\n");
  });

  it("is enabled by production and aggressive profiles", () => {
    const input = "Intro\n==Title==\nText\n";
    const expected = "Intro\n\n== Title ==\n\nText\n";
    expect(formatWikitext(input, { profile: "production" })).toBe(expected);
    expect(formatWikitext(input, { profile: "aggressive" })).toBe(expected);
  });

  it("adds spacing on both sides of a heading next to paragraphs", () => {
    expect(formatSectionSpacing("Intro\n== A ==\nText\n").formatted).toBe(
      "Intro\n\n== A ==\n\nText\n",
    );
  });

  it("uses parser-confirmed complete headings from the current snapshot", () => {
    const source = "Intro\n== A ==\nText\n";
    expect(
      formatSectionSpacing(source, session.createContext(source)).formatted,
    ).toBe("Intro\n\n== A ==\n\nText\n");

    const incomplete = "Intro\n== A == trailing\nText\n";
    expect(
      formatSectionSpacing(incomplete, session.createContext(incomplete))
        .formatted,
    ).toBe(incomplete);
  });

  it("uses the strict heading fallback when parser context is stale", () => {
    const source = "Intro\n== A ==\nText\n";
    expect(
      formatSectionSpacing(source, session.createContext("Plain text\n"))
        .formatted,
    ).toBe("Intro\n\n== A ==\n\nText\n");
  });

  it("does not treat level-1 headings as section-spacing headings", () => {
    const source = "Intro\n= Not a section =\nText\n";
    expect(
      formatSectionSpacing(source, session.createContext(source)).formatted,
    ).toBe(source);
  });

  it("does not treat a heading-like template parameter value as a section", () => {
    const source =
      "{{Container|before=alpha|content=\n=== Nested heading ===\n|after=omega}}\n";
    expect(
      formatSectionSpacing(source, session.createContext(source)).formatted,
    ).toBe(source);
    const result = formatWikitextSafe(source, { profile: "production" });
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toContain(
      "| content =\n=== Nested heading ===\n| after = omega\n",
    );
  });

  it.each([
    ["list", "* Item"],
    ["numbered list", "# Item"],
    ["definition list", "; Term"],
    ["indented content", ": Detail"],
    ["template", "{{Infobox}}"],
    ["table", "{| class=\"wikitable\"\n|-\n| Cell\n|}"],
    ["category", "[[Category:A]]"],
    ["DEFAULTSORT", "{{DEFAULTSORT:A}}"],
    ["interlanguage link", "[[en:Example]]"],
    ["file link", "[[File:A.png|thumb]]"],
    ["behavior switch", "__NOTOC__"],
    ["comment", "<!-- comment -->"],
    ["HTML", "<div>Text</div>"],
    ["extension block", "<nowiki>Text</nowiki>"],
    ["redirect-like line", "#REDIRECT [[Target]]"],
    ["protected placeholder", "\uE000wikitext-fmt:0\uE001"],
  ])("adds spacing between %s and a following heading", (_name, block) => {
    expect(formatSectionSpacing(`${block}\n== A ==\n`).formatted).toBe(
      `${block}\n\n== A ==\n`,
    );
  });

  it.each([
    ["list", "* Item"],
    ["numbered list", "# Item"],
    ["definition list", "; Term"],
    ["indented content", ": Detail"],
    ["template", "{{Infobox}}"],
    ["table", "{| class=\"wikitable\"\n|-\n| Cell\n|}"],
    ["category", "[[Category:A]]"],
    ["DEFAULTSORT", "{{DEFAULTSORT:A}}"],
    ["interlanguage link", "[[en:Example]]"],
    ["file link", "[[File:A.png|thumb]]"],
    ["behavior switch", "__NOTOC__"],
    ["comment", "<!-- comment -->"],
    ["HTML", "<div>Text</div>"],
    ["extension block", "<nowiki>Text</nowiki>"],
    ["redirect-like line", "#REDIRECT [[Target]]"],
    ["protected placeholder", "\uE000wikitext-fmt:0\uE001"],
  ])("adds spacing between a heading and following %s", (_name, block) => {
    expect(formatSectionSpacing(`== A ==\n${block}\n`).formatted).toBe(
      `== A ==\n\n${block}\n`,
    );
  });

  it("handles protected table and extension blocks through the full pipeline", () => {
    const input = [
      "==First==",
      '{| class="wikitable"',
      "|-",
      "| Cell",
      "|}",
      "==Second==",
      "<nowiki>",
      "raw",
      "</nowiki>",
      "",
    ].join("\n");
    expect(formatWikitext(input, { profile: "production" })).toBe(
      [
        "== First ==",
        "",
        '{| class="wikitable"',
        "|-",
        "| Cell",
        "|}",
        "",
        "== Second ==",
        "",
        "<nowiki>",
        "raw",
        "</nowiki>",
        "",
      ].join("\n"),
    );
  });

  it("keeps consecutive same-level and mixed-level headings together", () => {
    expect(formatSectionSpacing("== A ==\n== B ==\nText\n").formatted).toBe(
      "== A ==\n== B ==\n\nText\n",
    );
    expect(formatSectionSpacing("Text\n== A ==\n=== B ===\n").formatted).toBe(
      "Text\n\n== A ==\n=== B ===\n",
    );
  });

  it("does not add spacing outside headings at file boundaries", () => {
    expect(formatSectionSpacing("== A ==\nText").formatted).toBe(
      "== A ==\n\nText",
    );
    expect(formatSectionSpacing("Text\n== A ==").formatted).toBe(
      "Text\n\n== A ==",
    );
  });

  it("preserves existing single and multiple blank lines", () => {
    const single = "Intro\n\n== A ==\n\nText\n";
    const multiple = "Intro\n\n\n== A ==\n\n\nText\n";
    expect(formatSectionSpacing(single).formatted).toBe(single);
    expect(formatSectionSpacing(multiple).formatted).toBe(multiple);
  });

  it("delegates larger runs to blank-line normalization", () => {
    const input = "Intro\n\n\n\n==Title==\n\n\n\nText\n";
    expect(formatWikitext(input, options)).toBe(
      "Intro\n\n\n== Title ==\n\n\nText\n",
    );
  });

  it("preserves LF and formatter-wide CRLF behavior", () => {
    expect(formatWikitext("==Title==\n* Item\n", options)).toBe(
      "== Title ==\n\n* Item\n",
    );
    expect(
      formatWikitextSafe("==Title==\r\n* Item\r\n", {
        profile: "production",
      }).formatted,
    ).toBe("== Title ==\r\n\r\n* Item\r\n");
  });

  it("reports inserted spacing diagnostics", () => {
    const result = formatWikitextDetailedResult(
      "{{Infobox}}\n==Title==\n* Item\n",
      options,
    );
    expect(result.sectionSpacingDiagnostics).toEqual({
      sectionSpacingBeforeHeadingsInserted: 1,
      sectionSpacingAfterHeadingsInserted: 1,
    });
  });

  it("is idempotent without safe-mode fallback", () => {
    const input = "{{Infobox}}\n==Title==\n{|\n| Cell\n|}\n";
    const once = formatWikitextSafe(input, { profile: "production" });
    expect(once.failure).toBeUndefined();
    expect(once.warning).toBeUndefined();
    const twice = formatWikitextSafe(once.formatted, {
      profile: "production",
    });
    expect(twice.failure).toBeUndefined();
    expect(twice.formatted).toBe(once.formatted);
  });

  it("can be explicitly disabled for production", () => {
    expect(
      formatWikitext("Intro\n==Title==\nText\n", {
        profile: "production",
        formatSectionSpacing: false,
      }),
    ).toBe("Intro\n== Title ==\nText\n");
  });

  it("uses the current source snapshot after heading formatting", () => {
    expect(formatWikitext("Intro\n==Title==\nText\n", options)).toBe(
      "Intro\n\n== Title ==\n\nText\n",
    );
  });
});

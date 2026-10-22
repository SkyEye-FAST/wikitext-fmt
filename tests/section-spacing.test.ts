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
      "Intro\n\n== Title ==\nText\n",
    );
    expect(
      formatWikitext(input, {
        level: "safe",
        formatSectionSpacing: true,
      }),
    ).toBe("Intro\n== Title ==\nText\n");
  });

  it("is enabled by the production profile", () => {
    const input = "Intro\n==Title==\nText\n";
    const expected = "Intro\n\n== Title ==\nText\n";
    expect(formatWikitext(input, { profile: "production" })).toBe(expected);
  });

  it("recognizes complete headings with missing, current, or stale parser context", () => {
    const source = "Intro\n== A ==\nText\n";
    for (const context of [
      undefined,
      session.createContext(source),
      session.createContext("Plain text\n"),
    ]) {
      expect(formatSectionSpacing(source, context).formatted).toBe(
        "Intro\n\n== A ==\nText\n",
      );
    }

    const incomplete = "Intro\n== A == trailing\nText\n";
    expect(
      formatSectionSpacing(incomplete, session.createContext(incomplete))
        .formatted,
    ).toBe(incomplete);
  });

  it.each([
    "=Title==",
    "==Title=",
    "==Title===",
    "= =",
    "==",
    "= =Title =",
    "= Title= =",
    "=======Title=======",
    "=Title= trailing",
  ])("preserves ambiguous heading markers %j in every context", (heading) => {
    const source = `Intro\n${heading}\nText\n`;
    for (const context of [
      undefined,
      session.createContext("Plain text\n"),
      session.createContext(source),
    ]) {
      const result = formatSectionSpacing(source, context);
      expect(result.formatted).toBe(source);
      expect(result.diagnostics).toEqual({
        sectionSpacingBeforeHeadingsInserted: 0,
        sectionSpacingAfterHeadingsInserted: 0,
      });
    }
  });

  it("spaces an unpadded one-character level-1 heading", () => {
    const source = "Intro\n=A=\nText\n";
    const expected = "Intro\n\n=A=\nText\n";
    expect(formatSectionSpacing(source).formatted).toBe(expected);
    const result = formatWikitextSafe(source, {
      ...options,
      formatHeadings: false,
    });
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe(expected);
  });

  it("spaces level-1 headings and reports the inserted blank lines", () => {
    const source = "Intro\n= Section =\nText\n";
    const expected = "Intro\n\n= Section =\nText\n";
    expect(
      formatSectionSpacing(source, session.createContext(source)).formatted,
    ).toBe(expected);
    const result = formatWikitextDetailedResult(source, options);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe(expected);
    expect(result.sectionSpacingDiagnostics).toEqual({
      sectionSpacingBeforeHeadingsInserted: 1,
      sectionSpacingAfterHeadingsInserted: 0,
    });
    const safe = formatWikitextSafe(expected, { profile: "production" });
    expect(safe.failure).toBeUndefined();
    expect(safe.formatted).toBe(expected);
  });

  it("retains level-1 spacing when disabled or below normal level", () => {
    const source = "Intro\n= Title =\nText\n";
    expect(formatWikitext(source)).toBe(source);
    expect(formatWikitext(source, { ...options, level: "safe" })).toBe(source);
    expect(formatWikitext(source, {
      profile: "production",
      formatSectionSpacing: false,
    })).toBe(source);
  });

  it("keeps adjacent level-1 and level-2 headings together", () => {
    const result = formatWikitextSafe("=Title=\r\n==Child==\r\nText\r\n", {
      profile: "production",
    });
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe("= Title =\r\n== Child ==\r\nText\r\n");
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
  ])("adds spacing between %s and headings in both directions", (_name, block) => {
    expect(formatSectionSpacing(`${block}\n== A ==\n`).formatted).toBe(
      `${block}\n\n== A ==\n`,
    );
    // After headings, spacing follows the page: here the other heading is
    // already followed by a blank line.
    expect(
      formatSectionSpacing(
        `== A ==\n${block}\n\n== B ==\n\nText\n\n== C ==\n\nText\n`,
      ).formatted,
    ).toBe(`== A ==\n\n${block}\n\n== B ==\n\nText\n\n== C ==\n\nText\n`);
    expect(formatSectionSpacing(`== A ==\n${block}\n`).formatted).toBe(
      `== A ==\n${block}\n`,
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
        '{| class="wikitable"',
        "|-",
        "| Cell",
        "|}",
        "",
        "== Second ==",
        "<nowiki>",
        "raw",
        "</nowiki>",
        "",
      ].join("\n"),
    );
  });

  it("keeps consecutive same-level and mixed-level headings together", () => {
    expect(formatSectionSpacing("== A ==\n== B ==\n\nText\n").formatted).toBe(
      "== A ==\n== B ==\n\nText\n",
    );
    expect(formatSectionSpacing("Text\n== A ==\n== B ==\nText\n").formatted).toBe(
      "Text\n\n== A ==\n== B ==\nText\n",
    );
    expect(formatSectionSpacing("Text\n== A ==\n=== B ===\n").formatted).toBe(
      "Text\n\n== A ==\n=== B ===\n",
    );
  });

  it("does not add spacing outside headings at file boundaries", () => {
    expect(formatSectionSpacing("== A ==\nText").formatted).toBe(
      "== A ==\nText",
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
    expect(formatWikitext("Intro\n==Title==\n* Item\n", options)).toBe(
      "Intro\n\n== Title ==\n* Item\n",
    );
    expect(
      formatWikitextSafe("Intro\r\n==Title==\r\n* Item\r\n", {
        profile: "production",
      }).formatted,
    ).toBe("Intro\r\n\r\n== Title ==\r\n* Item\r\n");
  });

  it("reports inserted spacing diagnostics", () => {
    const result = formatWikitextDetailedResult(
      "{{Infobox}}\n==Title==\n* Item\n==Next==\n\nText\n== Last ==\n\nMore\n",
      options,
    );
    expect(result.formatted).toBe(
      "{{Infobox}}\n\n== Title ==\n\n* Item\n\n== Next ==\n\nText\n\n== Last ==\n\nMore\n",
    );
    expect(result.sectionSpacingDiagnostics).toEqual({
      sectionSpacingBeforeHeadingsInserted: 3,
      sectionSpacingAfterHeadingsInserted: 1,
    });
  });

  it.each([
    [
      "mostly no blank line after headings",
      "== A ==\nText\n== B ==\nText\n== C ==\n\nText\n",
      "== A ==\nText\n\n== B ==\nText\n\n== C ==\n\nText\n",
    ],
    [
      "a tie between both habits",
      "== A ==\nText\n== B ==\n\nText\n",
      "== A ==\nText\n\n== B ==\n\nText\n",
    ],
    [
      "mostly a blank line after headings",
      "== A ==\nText\n== B ==\n\nText\n== C ==\n\nText\n",
      "== A ==\n\nText\n\n== B ==\n\nText\n\n== C ==\n\nText\n",
    ],
  ])("follows the page habit after headings with %s", (_name, input, expected) => {
    const once = formatSectionSpacing(input).formatted;
    expect(once).toBe(expected);
    expect(formatSectionSpacing(once).formatted).toBe(once);
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
});

import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import {
  createNodeParserSession,
  getParserConfig,
  nodeParserRuntime,
} from "../src/parser.js";
import { parserConfigWithInterwikiPrefixes } from "../src/parserRuntime.js";
import { formatPageFooter } from "../src/rules/categories.js";

const localization = {
  localizationSource: "builtin",
  localizedSyntaxStyle: "preserve",
  localizationAliases: {},
} as const;

const footerOptions = {
  formatCategories: false,
  formatBehaviorSwitches: false,
  behaviorSwitchPlacement: "preserve" as const,
  formatInterlanguageLinks: true,
  interlanguagePlacement: "footer" as const,
  interlanguagePrefixes: ["en", "ja", "zh", "zh-hans", "zh-hant"],
  ...localization,
};

describe("parser-assisted interlanguage footer formatting", () => {
  it("is disabled by the default profile", () => {
    const input = "[[en:Foo]]\nBody\n";
    expect(formatWikitext(input)).toBe(input);
  });

  it("moves parser-confirmed root-level whole-line links in production", () => {
    const input = "[[en:Foo]]\n[[ja:Foo]]\nBody\n[[Category:A]]\n";
    const expected = "Body\n\n[[Category:A]]\n\n[[en:Foo]]\n[[ja:Foo]]\n";
    const result = formatWikitextSafeDetailed(input, { profile: "production" });
    expect(result.failure).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(expected);
    expect(
      formatWikitextSafeDetailed(expected, { profile: "production" }).formatted,
    ).toBe(expected);
  });

  it("preserves target bytes, prefix spelling, duplicates, and source order", () => {
    const input =
      "Body\n[[ZH:繁體 標題]]\n[[en:Foo/bar]]\n[[en:Foo/bar]]\n";
    expect(formatWikitext(input, { profile: "production" })).toBe(
      "Body\n\n[[ZH:繁體 標題]]\n[[en:Foo/bar]]\n[[en:Foo/bar]]\n",
    );
  });

  it("trims only trailing ASCII layout whitespace in preserve mode", () => {
    const input = "Body\n[[en:Foo]] \t\nText\n";
    expect(
      formatWikitext(input, {
        level: "normal",
        formatInterlanguageLinks: true,
        interlanguagePlacement: "preserve",
      }),
    ).toBe("Body\n[[en:Foo]]\nText\n");
  });

  it("does not move generic interwiki prefixes", () => {
    const input =
      "[[commons:File]]\n[[mw:Manual]]\n[[wikipedia:Article]]\nBody\n";
    expect(formatWikitext(input, { profile: "production" })).toBe(input);
  });

  it("allows an explicitly authoritative generic prefix", () => {
    const input = "[[commons:File]]\nBody\n";
    expect(
      formatWikitext(input, {
        profile: "production",
        interlanguagePrefixes: ["commons"],
      }),
    ).toBe("Body\n\n[[commons:File]]\n");
  });

  it("reports parser-classified generic interwiki links separately", () => {
    const base = getParserConfig("mediawiki");
    const config = parserConfigWithInterwikiPrefixes(
      { ...base, interwiki: [...base.interwiki, "commons"] },
      footerOptions.interlanguagePrefixes,
    );
    const source = "[[commons:File]]\nBody\n";
    const result = formatPageFooter(
      createNodeParserSession(config).createContext(source),
      footerOptions,
      source,
    );
    expect(result.formatted).toBe(source);
    expect(result.diagnostics.interlanguageLinkSkipReasons).toEqual({
      "generic-interwiki": 1,
    });
  });

  it.each([
    "[[:en:Foo]]\n",
    "[[en:Foo|label]]\n",
    "Text [[en:Foo]] here\n",
    "[[xx-custom:Foo]]\n",
    "[[en:]]\n",
    "[[en:Foo]\n",
  ])("preserves unsupported or malformed interlanguage-like input %s", (input) => {
    expect(formatWikitext(input, { profile: "production" })).toBe(input);
  });

  it("does not move links from unsafe structural parents", () => {
    const input = [
      "{{T|value=",
      "[[en:Template]]",
      "}}",
      "{|",
      "| [[en:Table]]",
      "|}",
      "<!-- [[en:Comment]] -->",
      "<span>",
      "[[en:Html]]",
      "</span>",
      "<ref>",
      "[[en:Reference]]",
      "</ref>",
      "<nowiki>[[en:Extension]]</nowiki>",
      "Body",
      "[[en:Root]]",
      "",
    ].join("\n");
    const result = formatWikitextSafeDetailed(input, {
      profile: "production",
      formatTemplates: false,
      formatTables: false,
      formatReferences: false,
      formatSectionSpacing: false,
    });
    expect(result.failure).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toContain("[[en:Template]]");
    expect(result.formatted).toContain("[[en:Table]]");
    expect(result.formatted).toContain("[[en:Comment]]");
    expect(result.formatted).toContain("[[en:Html]]");
    expect(result.formatted).toContain("[[en:Reference]]");
    expect(result.formatted).toContain("[[en:Extension]]");
    expect(result.formatted).toMatch(/Body\n\n\[\[en:Root\]\]\n$/u);
  });

  it("fails closed for a stale parser context", () => {
    const source = "[[en:Current]]\nBody\n";
    const session = nodeParserRuntime.createSession("mediawiki", {
      interwikiPrefixes: footerOptions.interlanguagePrefixes,
    });
    const result = formatPageFooter(
      session.createContext("[[en:Stale]]\nBody\n"),
      footerOptions,
      source,
    );
    expect(result.formatted).toBe(source);
    expect(result.diagnostics).toMatchObject({
      interlanguageLinksInspected: 1,
      interlanguageLinksEligible: 0,
      interlanguageLinksSkipped: 1,
      interlanguageLinkSkipReasons: { "not-parser-confirmed": 1 },
    });
  });

  it("requires the parser to classify a configured prefix as interwiki", () => {
    const source = "[[en:Foo]]\nBody\n";
    const session = createNodeParserSession(getParserConfig("mediawiki"));
    const result = formatPageFooter(
      session.createContext(source),
      footerOptions,
      source,
    );
    expect(result.formatted).toBe(source);
    expect(result.diagnostics.interlanguageLinkSkipReasons).toEqual({
      "not-parser-confirmed": 1,
    });
  });

  it("does not reinterpret a conflicting local namespace as interlanguage", () => {
    const base = getParserConfig("mediawiki");
    const config = parserConfigWithInterwikiPrefixes(
      {
        ...base,
        namespaces: { ...base.namespaces, 3000: "En" },
        nsid: { ...base.nsid, en: 3000 },
      },
      ["en"],
    );
    const source = "[[en:Local page]]\nBody\n";
    const result = formatPageFooter(
      createNodeParserSession(config).createContext(source),
      footerOptions,
      source,
    );
    expect(config.interwiki).not.toContain("en");
    expect(result.formatted).toBe(source);
    expect(result.diagnostics.interlanguageLinkSkipReasons).toEqual({
      "not-parser-confirmed": 1,
    });
  });

  it("reports eligible, formatted, and distinct skipped candidates", () => {
    const input = [
      "[[en:Moved]]   ",
      "[[en:Labelled|label]]",
      "[[:en:Colon]]",
      "Text [[en:Inline]]",
      "[[commons:Generic]]",
      "[[xx:Unknown]]",
      "Body",
      "",
    ].join("\n");
    const result = formatWikitextDetailedResult(input, {
      profile: "production",
    });
    expect(result.footerDiagnostics).toMatchObject({
      interlanguageLinksInspected: 6,
      interlanguageLinksEligible: 1,
      interlanguageLinksSkipped: 5,
      interlanguageLinksMoved: 1,
      interlanguageLinksFormatted: 1,
      interlanguageLinkSkipReasons: {
        "labelled-link": 1,
        "leading-colon": 1,
        "not-whole-line": 1,
        "unconfigured-prefix": 2,
      },
    });
  });

  it("lets explicit options override production and the normal level gate", () => {
    const input = "[[en:Example]]\nBody\n";
    expect(
      formatWikitext(input, {
        profile: "production",
        formatInterlanguageLinks: false,
      }),
    ).toBe(input);
    expect(
      formatWikitext(input, {
        profile: "production",
        interlanguagePlacement: "preserve",
      }),
    ).toBe(input);
    expect(
      formatWikitext(input, { profile: "production", level: "safe" }),
    ).toBe(input);
  });
});

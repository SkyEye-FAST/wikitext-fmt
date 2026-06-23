import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import { formatRedirects } from "../src/rules/redirects.js";

const config = getParserConfig("mediawiki");
const redirectOptions = {
  localizationSource: "builtin",
  localizedSyntaxStyle: "preserve",
  localizationAliases: {},
} as const;

describe("redirect formatting", () => {
  it.each([
    ["#REDIRECT[[Target]]\n", "#REDIRECT [[Target]]\n"],
    ["#重定向[[Target]]\n", "#重定向 [[Target]]\n"],
    ["#転送[[Target]]\n", "#転送 [[Target]]\n"],
    ["#넘겨주기[[Target]]\n", "#넘겨주기 [[Target]]\n"],
  ])("normalizes redirect spacing for %s", (input, expected) => {
    expect(formatWikitext(input)).toBe(expected);
  });

  it("canonicalizes localized redirect aliases when requested", () => {
    expect(
      formatWikitext("#転送[[Target]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("#REDIRECT [[Target]]\n");
  });

  it("formats a parser-confirmed redirect with explicit context", () => {
    const source = "#REDIRECT[[Target]]\n";
    expect(
      formatRedirects(
        source,
        redirectOptions,
        createParserContext(source, config),
      ).formatted,
    ).toBe("#REDIRECT [[Target]]\n");
  });

  it("ignores a stale redirect parser context safely", () => {
    const source = "#REDIRECT[[Target]]\n";
    expect(
      formatRedirects(
        source,
        redirectOptions,
        createParserContext("Plain text\n", config),
      ).formatted,
    ).toBe("#REDIRECT [[Target]]\n");
  });

  it("formats redirects after leading blank lines", () => {
    expect(formatWikitext("\n\n#REDIRECT[[Target]]\n")).toBe(
      "\n\n#REDIRECT [[Target]]\n",
    );
  });

  it("reports redirect formatting and canonicalization", () => {
    const result = formatWikitextDetailedResult("#転送[[Target]]\n", {
      localizedSyntaxStyle: "canonical-english",
    });
    expect(result.redirectDiagnostics).toEqual({
      redirectsFormatted: 1,
      localizedRedirectAliasesCanonicalized: 1,
    });
  });

  it("preserves redirects that are not the first non-empty line", () => {
    const input = "Text.\n#REDIRECT[[Target]]\n";
    expect(formatWikitext(input)).toBe(input);
  });

  it.each([
    "#REDIRECT[[{{Target}}]]\n",
    "#REDIRECT[[Target]] extra\n",
    "#REDIRECT[[Target]] <!-- comment -->\n",
    "#REDIRECT[[Target]][[Other]]\n",
    "#REDIRECT[[Target|label]]\n",
    "#UNKNOWN[[Target]]\n",
    "{{T|x=#REDIRECT [[Target]]}}\n",
  ])("preserves unsafe redirect line %s", (input) => {
    expect(formatWikitext(input, { formatTemplates: false })).toBe(input);
  });

  it("supports custom redirect aliases", () => {
    expect(
      formatWikitext("#GO[[Target]]\n", {
        localizationSource: "custom",
        localizationAliases: { redirectMagicWords: ["#GO"] },
      }),
    ).toBe("#GO [[Target]]\n");
  });

  it("supports siteinfo redirect aliases when aliases are preloaded", () => {
    expect(
      formatWikitext("#REDIRECTX[[Target]]\n", {
        localizationSource: "siteinfo",
        localizationAliases: { redirectMagicWords: ["#REDIRECTX"] },
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("#REDIRECT [[Target]]\n");
  });

  it("can disable redirect formatting", () => {
    expect(
      formatWikitext("#REDIRECT[[Target]]\n", { formatRedirects: false }),
    ).toBe("#REDIRECT[[Target]]\n");
  });
});

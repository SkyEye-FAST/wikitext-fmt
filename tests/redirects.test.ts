import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";

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
  ])("preserves unsafe redirect line %s", (input) => {
    expect(formatWikitext(input)).toBe(input);
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

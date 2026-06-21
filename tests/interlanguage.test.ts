import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";

const experimentalFooterOptions = {
  level: "experimental" as const,
  formatInterlanguageLinks: true,
  interlanguagePlacement: "footer" as const,
};

describe("experimental interlanguage footer formatting", () => {
  it("is disabled by default", () => {
    const input = "[[en:Foo]]\nBody\n";
    expect(formatWikitext(input)).toBe(input);
  });

  it("moves standalone interlanguage links after categories", () => {
    const input = "[[en:Foo]]\n[[ja:Foo]]\nBody\n[[Category:A]]\n";
    expect(formatWikitext(input, experimentalFooterOptions)).toBe(
      "Body\n\n[[Category:A]]\n\n[[en:Foo]]\n[[ja:Foo]]\n",
    );
  });

  it("preserves target and relative order without sorting", () => {
    const input = "Body\n[[zh:繁體 標題]]\n[[en:Foo/bar]]\n";
    expect(formatWikitext(input, experimentalFooterOptions)).toBe(
      "Body\n\n[[zh:繁體 標題]]\n[[en:Foo/bar]]\n",
    );
  });

  it.each([
    "[[:en:Foo]]\n",
    "[[en:Foo|label]]\n",
    "Text [[en:Foo]] here\n",
    "[[xx-custom:Foo]]\n",
    "[[File:Foo.png]]\n",
    "[[Category:Foo]]\n",
    "| [[en:Foo]]\n",
  ])("preserves unsupported interlanguage-like line %s", (input) => {
    expect(formatWikitext(input, experimentalFooterOptions)).toBe(input);
  });

  it("supports configured prefixes", () => {
    expect(
      formatWikitext("Body\n[[simple:Foo]]\n", {
        ...experimentalFooterOptions,
        interlanguagePrefixes: ["simple"],
      }),
    ).toBe("Body\n\n[[simple:Foo]]\n");
  });

  it("reports moved and formatted interlanguage links", () => {
    const result = formatWikitextDetailedResult("Body\n[[en:Foo]]   \n", {
      ...experimentalFooterOptions,
    });
    expect(result.footerDiagnostics).toMatchObject({
      interlanguageLinksMoved: 1,
      interlanguageLinksFormatted: 1,
    });
  });
});

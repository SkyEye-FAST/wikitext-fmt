import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextSafeDetailed,
} from "../src/index.js";

const ignore = "<!-- wikitext-fmt-ignore -->";
const ignoreStart = "<!-- wikitext-fmt-ignore-start -->";
const ignoreEnd = "<!-- wikitext-fmt-ignore-end -->";

function expectSafeFormat(input: string, expected: string): void {
  const result = formatWikitextSafeDetailed(input);
  expect(result.failure).toBeUndefined();
  expect(result.warning).toBeUndefined();
  expect(result.formatted).toBe(expected);
  expect(formatWikitext(expected)).toBe(expected);
}

describe("ignore markers", () => {
  it("ignores only the next parser-confirmed formatting unit", () => {
    const input = [
      "[[Before_Page]]",
      ignore,
      "[[Keep_Underscore]] [[After_Page]]",
      `Text ${ignore}[[Inline_Keep]] [[Inline_After]]`,
      ignore,
      "{{T| a = b }} [[After_Template]]",
      ignore,
      "==Unformatted==",
      "==Formatted==",
      "",
    ].join("\n");
    const expected = [
      "[[Before Page]]",
      ignore,
      "[[Keep_Underscore]] [[After Page]]",
      `Text ${ignore}[[Inline_Keep]] [[Inline After]]`,
      ignore,
      "{{T| a = b }} [[After Template]]",
      ignore,
      "==Unformatted==",
      "== Formatted ==",
      "",
    ].join("\n");

    expectSafeFormat(input, expected);
  });

  it("keeps nested and unclosed ignore regions fail-closed", () => {
    const nested = [
      ignoreStart,
      "[[Keep_One]]",
      ignoreStart,
      "[[Keep_Two]]",
      ignoreEnd,
      "[[Keep_Three]]",
      ignoreEnd,
      "[[After_Range]]",
      ignoreEnd,
      "[[After_Unmatched_End]]",
      "",
    ].join("\n");
    const expectedNested = nested
      .replace("[[After_Range]]", "[[After Range]]")
      .replace("[[After_Unmatched_End]]", "[[After Unmatched End]]");
    expectSafeFormat(nested, expectedNested);

    const unclosed = `${ignoreStart}\n[[Keep_One]]\n[[Keep_Two]]\n`;
    expectSafeFormat(unclosed, unclosed);
  });

  it("does not activate marker-like text inside opaque extension blocks", () => {
    const input = [
      `<nowiki>${ignore}</nowiki>`,
      "[[After_Nowiki]]",
      `<source>${ignoreStart}</source>`,
      "[[After_Source]]",
      "",
    ].join("\n");
    const expected = input
      .replace("[[After_Nowiki]]", "[[After Nowiki]]")
      .replace("[[After_Source]]", "[[After Source]]");

    expectSafeFormat(input, expected);
  });

  it("falls back to one list line or one paragraph for plain-text blocks", () => {
    const input = [
      ignore,
      ":c",
      "[[After_List]]",
      "",
      ignore,
      "Plain [[Keep_Link]]",
      "still [[Keep_Too]]",
      "",
      "[[After_Paragraph]]",
      "",
    ].join("\n");
    const expected = input
      .replace("[[After_List]]", "[[After List]]")
      .replace("[[After_Paragraph]]", "[[After Paragraph]]");

    expectSafeFormat(input, expected);
  });
});

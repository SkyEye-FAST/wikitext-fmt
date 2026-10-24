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
      "[[Before_Page|x]]",
      ignore,
      "[[Keep_Underscore|x]] [[After_Page|x]]",
      `Text ${ignore}[[Inline_Keep|x]] [[Inline_After|x]]`,
      ignore,
      "{{T| a = b }} [[After_Template|x]]",
      ignore,
      "==Unformatted==",
      "==Formatted==",
      "",
    ].join("\n");
    const expected = [
      "[[Before Page|x]]",
      ignore,
      "[[Keep_Underscore|x]] [[After Page|x]]",
      `Text ${ignore}[[Inline_Keep|x]] [[Inline After|x]]`,
      ignore,
      "{{T| a = b }} [[After Template|x]]",
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
      "[[Keep_One|x]]",
      ignoreStart,
      "[[Keep_Two|x]]",
      ignoreEnd,
      "[[Keep_Three|x]]",
      ignoreEnd,
      "[[After_Range|x]]",
      ignoreEnd,
      "[[After_Unmatched_End|x]]",
      "",
    ].join("\n");
    const expectedNested = nested
      .replace("[[After_Range|x]]", "[[After Range|x]]")
      .replace("[[After_Unmatched_End|x]]", "[[After Unmatched End|x]]");
    expectSafeFormat(nested, expectedNested);

    const unclosed = `${ignoreStart}\n[[Keep_One|x]]\n[[Keep_Two|x]]\n`;
    expectSafeFormat(unclosed, unclosed);
  });

  it("does not activate marker-like text inside opaque extension blocks", () => {
    const input = [
      `<nowiki>${ignore}</nowiki>`,
      "[[After_Nowiki|x]]",
      `<source>${ignoreStart}</source>`,
      "[[After_Source|x]]",
      "",
    ].join("\n");
    const expected = input
      .replace("[[After_Nowiki|x]]", "[[After Nowiki|x]]")
      .replace("[[After_Source|x]]", "[[After Source|x]]");

    expectSafeFormat(input, expected);
  });

  it("falls back to one list line or one paragraph for plain-text blocks", () => {
    const input = [
      ignore,
      ":c",
      "[[After_List|x]]",
      "",
      ignore,
      "Plain [[Keep_Link|x]]",
      "still [[Keep_Too|x]]",
      "",
      "[[After_Paragraph|x]]",
      "",
    ].join("\n");
    const expected = input
      .replace("[[After_List|x]]", "[[After List|x]]")
      .replace("[[After_Paragraph|x]]", "[[After Paragraph|x]]");

    expectSafeFormat(input, expected);
  });
});

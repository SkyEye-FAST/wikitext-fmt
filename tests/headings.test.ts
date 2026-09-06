import { describe, expect, it } from "vitest";

import { formatWikitextSafeDetailed } from "../src/index.js";
import { formatHeadings } from "../src/rules/headings.js";

describe("heading formatting", () => {
  it.each([
    ["level-1 markers", "=Title=", "= Title ="],
    ["level-1 ASCII whitespace", "= \t Title \t =\t", "= Title ="],
    ["level-1 non-ASCII whitespace", "=\u00A0Title\u3000=", "= \u00A0Title\u3000 ="],
    ["ASCII spaces", "==   Title   ==", "== Title =="],
    ["ASCII tabs", "==\t\tTitle\t\t==", "== Title =="],
    [
      "U+00A0 NO-BREAK SPACE",
      "==\u00A0Title\u00A0==",
      "== \u00A0Title\u00A0 ==",
    ],
    [
      "U+202F NARROW NO-BREAK SPACE",
      "==\u202FTitle\u202F==",
      "== \u202FTitle\u202F ==",
    ],
    [
      "U+3000 IDEOGRAPHIC SPACE",
      "==\u3000Title\u3000==",
      "== \u3000Title\u3000 ==",
    ],
    [
      "mixed ASCII and non-ASCII boundary whitespace",
      "== \t\u00A0Title\u202F\u3000 \t==",
      "== \u00A0Title\u202F\u3000 ==",
    ],
  ])("normalizes %s without removing title content", (_name, input, expected) => {
    expect(formatHeadings(input)).toBe(expected);
    expect(formatHeadings(expected)).toBe(expected);

    const safe = formatWikitextSafeDetailed(`${input}\n`);
    expect(safe.failure).toBeUndefined();
    expect(safe.formatted).toBe(`${expected}\n`);
  });

  it("formats level-1 headings at safe level and respects the option", () => {
    const input = "=Title=\n";
    expect(formatWikitextSafeDetailed(input, { level: "safe" }).formatted).toBe(
      "= Title =\n",
    );
    expect(
      formatWikitextSafeDetailed(input, { formatHeadings: false }).formatted,
    ).toBe(input);
  });

  it.each([
    "=Title==\n",
    "==Title=\n",
    "==\n",
    "= =\n",
    "=======Title=======\n",
    "Text =Title=\n",
    "=Title= trailing\n",
    "<nowiki>\n=Title=\n</nowiki>\n",
    "<!--\n=Title=\n-->\n",
    "<!-- wikitext-fmt-ignore -->\n=Title=\n",
  ])("preserves ambiguous or protected input %j", (input) => {
    const result = formatWikitextSafeDetailed(input, { formatTemplates: false });
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe(input);
  });

  it("formats a nested heading without inserting section gaps in its parameter", () => {
    const result = formatWikitextSafeDetailed("{{T|value=\n=Title=\n}}\n", {
      formatTemplates: false,
      formatSectionSpacing: true,
    });
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe("{{T|value=\n= Title =\n}}\n");
  });

  it("preserves level-1 heading content and CRLF through verification", () => {
    const result = formatWikitextSafeDetailed("=See [[Page|label]] and {{T}}=\r\n");
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe("= See [[Page|label]] and {{T}} =\r\n");
  });
});

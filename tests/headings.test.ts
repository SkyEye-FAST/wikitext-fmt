import { describe, expect, it } from "vitest";

import { formatWikitextSafeDetailed } from "../src/index.js";
import { formatHeadings } from "../src/rules/headings.js";

describe("heading formatting", () => {
  it.each([
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
    expect(formatWikitextSafeDetailed(safe.formatted).formatted).toBe(
      safe.formatted,
    );
  });
});

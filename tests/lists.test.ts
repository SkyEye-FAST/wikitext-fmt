import { describe, expect, it } from "vitest";

import { formatWikitext } from "../src/index.js";
import { formatLists } from "../src/rules/lists.js";

describe("list formatting", () => {
  it.each([
    ["*item", "* item"],
    ["*  item", "* item"],
    ["*\titem", "* item"],
    ["* \t item", "* item"],
    ["**item", "** item"],
    ["**   item", "** item"],
    ["#item", "# item"],
    ["##item", "## item"],
    ["##\t\titem", "## item"],
    [":definition", ": definition"],
    [";term", "; term"],
    ["*#item", "*# item"],
    ["#*item", "#* item"],
    [":;item", ":; item"],
    [";:item", ";: item"],
    [";Term : definition", "; Term : definition"],
    ["* already spaced", "* already spaced"],
    ["* item   ", "* item"],
    ["# item\t  ", "# item"],
  ])("formats %s", (input, expected) => {
    const once = formatLists(`${input}\n`);
    expect(once).toBe(`${expected}\n`);
    expect(formatLists(once)).toBe(once);
  });

  it.each([
    ["*", "*"],
    ["*   ", "*"],
    ["#\t", "#"],
    [": \t ", ":"],
    [";:", ";:"],
    ["** \t", "**"],
  ])("keeps empty item %s free of trailing whitespace", (input, expected) => {
    const once = formatLists(`${input}\n`);
    expect(once).toBe(`${expected}\n`);
    expect(formatLists(once)).toBe(once);
  });

  it.each([
    ["U+00A0 NO-BREAK SPACE", "*\u00A0item"],
    ["U+202F NARROW NO-BREAK SPACE", "#\u202Fitem"],
    ["U+3000 IDEOGRAPHIC SPACE", ":\u3000item"],
  ])("preserves a %s separator", (_name, line) => {
    expect(formatLists(`${line}\n`)).toBe(`${line}\n`);
  });

  it("removes trailing ASCII layout without removing Unicode whitespace", () => {
    const once = formatLists("* item\u00A0\t  \n");
    expect(once).toBe("* item\u00A0\n");
    expect(formatLists(once)).toBe(once);
  });

  it.each([
    "*{{Template}}   ",
    "*  {{Template}}   ",
    "#\t{{#if:x|yes|no}}   ",
    ":  [[Page|label]]   ",
    "* <ref>source</ref>   ",
    "* <span>HTML</span>   ",
    "* {| table   ",
    "* \uE000wikitext-fmt:0\uE001   ",
  ])("preserves risky line %s", (line) => {
    expect(formatLists(`${line}\n`)).toBe(`${line}\n`);
  });

  it("can be disabled and is excluded from safe level", () => {
    expect(formatWikitext("*item\n", { formatLists: false })).toBe("*item\n");
    expect(formatWikitext("*item\n", { level: "safe" })).toBe("*item\n");
  });
});

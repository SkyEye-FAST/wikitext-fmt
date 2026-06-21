import { describe, expect, it } from "vitest";
import { formatWikitext } from "../src/index.js";
import { formatLists } from "../src/rules/lists.js";

describe("list formatting", () => {
  it.each([
    ["*item", "* item"],
    ["**item", "** item"],
    ["#item", "# item"],
    [":definition", ": definition"],
    [";term", "; term"],
    ["*#item", "*# item"],
    [":*item", ":* item"],
    ["* already spaced", "* already spaced"],
    ["* item   ", "* item"],
  ])("formats %s", (input, expected) => {
    expect(formatLists(`${input}\n`)).toBe(`${expected}\n`);
  });

  it.each([
    "*{{Template}}   ",
    "* <ref>source</ref>   ",
    "* <span>HTML</span>   ",
    "* {| table   ",
  ])("preserves risky line %s", (line) => {
    expect(formatLists(`${line}\n`)).toBe(`${line}\n`);
  });

  it("can be disabled and is excluded from safe level", () => {
    expect(formatWikitext("*item\n", { formatLists: false })).toBe("*item\n");
    expect(formatWikitext("*item\n", { level: "safe" })).toBe("*item\n");
  });
});

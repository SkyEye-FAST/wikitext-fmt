import { describe, expect, it } from "vitest";
import { formatWikitext } from "../src/index.js";

const options = {
  level: "experimental" as const,
  formatSectionSpacing: true,
};

describe("experimental section spacing", () => {
  it("is disabled by default", () => {
    const input = "Intro\n==Title==\nText\n";
    expect(formatWikitext(input)).toBe("Intro\n== Title ==\nText\n");
  });

  it("adds one blank line before and after headings near ordinary paragraphs", () => {
    expect(formatWikitext("Intro\n==Title==\nText\n", options)).toBe(
      "Intro\n\n== Title ==\n\nText\n",
    );
  });

  it("does not add a blank line at the start of the file", () => {
    expect(formatWikitext("==Title==\nText\n", options)).toBe(
      "== Title ==\n\nText\n",
    );
  });

  it("preserves consecutive headings", () => {
    expect(formatWikitext("==A==\n===B===\nText\n", options)).toBe(
      "== A ==\n=== B ===\n\nText\n",
    );
  });

  it.each([
    "{{Infobox}}\n==Title==\nText\n",
    "* Item\n==Title==\nText\n",
    "{|\n| A\n|}\n==Title==\nText\n",
    "[[Category:A]]\n==Title==\nText\n",
  ])("preserves risky spacing context %s", (input) => {
    const output = formatWikitext(input, options);
    expect(output).not.toContain("\n\n== Title ==");
  });

  it("can be explicitly disabled", () => {
    expect(
      formatWikitext("Intro\n==Title==\nText\n", {
        level: "experimental",
        formatSectionSpacing: false,
      }),
    ).toBe("Intro\n== Title ==\nText\n");
  });
});

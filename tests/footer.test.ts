import { describe, expect, it } from "vitest";
import { getParserConfig } from "../src/parser.js";
import {
  formatPageFooter,
  isStandaloneBehaviorSwitchLine,
} from "../src/rules/categories.js";

const config = getParserConfig("mediawiki");
const localization = {
  localizationSource: "builtin",
  localizedSyntaxStyle: "preserve",
  localizationAliases: {},
} as const;

describe("page footer formatting", () => {
  it.each([
    "__NOTOC__",
    "__FORCETOC__   ",
    "__NOEDITSECTION__",
    "__NEWSECTIONLINK__",
    "__NONEWSECTIONLINK__",
    "__INDEX__",
    "__NOINDEX__",
  ])("detects standalone behavior switch %s", (line) => {
    expect(isStandaloneBehaviorSwitchLine(line)).toBe(true);
  });

  it.each(["Text __NOTOC__", "__NOTOC__ text", " __NOTOC__", "__UNKNOWN__"])(
    "rejects non-standalone behavior switch %s",
    (line) => {
      expect(isStandaloneBehaviorSwitchLine(line)).toBe(false);
    },
  );

  it("preserves behavior switches inside templates", () => {
    const source = "{{Foo|value=\n__NOTOC__   \n}}\n";
    expect(
      formatPageFooter(source, config, {
        formatCategories: true,
        formatBehaviorSwitches: true,
        behaviorSwitchPlacement: "footer",
        ...localization,
      }).formatted,
    ).toBe(source);
  });

  it("orders switches, DEFAULTSORT aliases, and categories conservatively", () => {
    const source =
      "[[Category:B]]\n__NOTOC__   \nBody\n{{DEFAULTSORTKEY:Example}}   \n__NOINDEX__\n";
    const result = formatPageFooter(source, config, {
      formatCategories: true,
      formatBehaviorSwitches: true,
      behaviorSwitchPlacement: "footer",
      ...localization,
    });
    expect(result.formatted).toBe(
      "Body\n\n__NOTOC__\n__NOINDEX__\n\n{{DEFAULTSORTKEY:Example}}\n[[Category:B]]\n",
    );
    expect(result.diagnostics.behaviorSwitchesFormatted).toBe(1);
    expect(result.diagnostics.behaviorSwitchesMoved).toBeGreaterThan(0);
    expect(result.diagnostics.defaultsortMoved).toBeGreaterThan(0);
    expect(result.diagnostics.categoriesMoved).toBeGreaterThan(0);
  });
});

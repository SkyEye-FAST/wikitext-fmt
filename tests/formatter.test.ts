import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextSafe, ruleLevels } from "../src/index.js";

describe("formatter API", () => {
  it("is idempotent", () => {
    const input = "==Title==\n{{Foo|a=1|b=2}}\n[[Category:A]]\n";
    const once = formatWikitext(input);
    expect(formatWikitext(once)).toBe(once);
  });

  it("falls back safely without throwing", () => {
    const input = "==Title==\n";
    const result = formatWikitextSafe(input, { parserConfig: "missing-parser-config" });
    expect(result.formatted).toBe(input);
    expect(result.warning).toMatch(/Safe formatting failed/u);
  });

  it("safe formatting returns parseable, idempotent output", () => {
    const result = formatWikitextSafe("==Title==\n{{Foo|a=1}}\n");
    expect(result.warning).toBeUndefined();
    expect(formatWikitext(result.formatted)).toBe(result.formatted);
  });

  it("safe level excludes normal rules", () => {
    const input = "==Title==\n{{Foo|a=1}}\nText\n[[Category:A]]\n";
    expect(formatWikitext(input, { level: "safe" })).toBe(
      "== Title ==\n{{Foo|a=1}}\nText\n[[Category:A]]\n",
    );
  });

  it("publishes the reliability level of every rule", () => {
    expect(ruleLevels).toEqual({
      headings: "safe",
      blankLines: "safe",
      templates: "normal",
      categories: "normal",
      htmlVoidTags: "safe",
    });
  });

  it("preserves HTML void tag syntax in preserve mode", () => {
    const input = "Before<br />after<hr>\n";
    expect(formatWikitext(input, { htmlVoidTagStyle: "preserve" })).toBe(input);
  });

  it("uses XHTML syntax when requested", () => {
    expect(formatWikitext("Before<br>middle<br/>after\n", { htmlVoidTagStyle: "xhtml" })).toBe(
      "Before<br />middle<br />after\n",
    );
  });

  it("can disable individual rules", () => {
    expect(formatWikitext("==Title==\n", { formatHeadings: false })).toBe("==Title==\n");
  });
});

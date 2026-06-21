import { describe, expect, it } from "vitest";
import { formatWikitext } from "../src/index.js";

describe("rule interaction hardening", () => {
  it("combines template parameter formatting with section spacing", () => {
    const input = "Intro\n==Box==\n{{Infobox\n| name=value\n}}\n";
    expect(
      formatWikitext(input, {
        level: "experimental",
        formatTemplateParameters: true,
        formatSectionSpacing: true,
      }),
    ).toBe("Intro\n\n== Box ==\n{{Infobox\n| name = value\n}}\n");
  });

  it("combines template parameter formatting with file links", () => {
    const input =
      "{{Infobox\n| name=value\n}}\n[[ファイル:A.png|サムネイル|右]]\n";
    expect(
      formatWikitext(input, {
        level: "experimental",
        formatTemplateParameters: true,
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("{{Infobox\n| name = value\n}}\n[[File:A.png|thumb|right]]\n");
  });

  it("combines template parameter formatting with category footer movement", () => {
    const input = "[[Category:A]]\n{{Infobox\n| name=value\n}}\nBody\n";
    expect(
      formatWikitext(input, {
        level: "experimental",
        formatTemplateParameters: true,
      }),
    ).toBe("{{Infobox\n| name = value\n}}\nBody\n\n[[Category:A]]\n");
  });

  it("combines template parameter formatting with table preservation", () => {
    const input =
      '{{Infobox\n| name=value\n}}\n{| class="wikitable"\n! A !! B   \n|}\n';
    expect(
      formatWikitext(input, {
        level: "experimental",
        formatTemplateParameters: true,
      }),
    ).toBe(
      '{{Infobox\n| name = value\n}}\n{| class="wikitable"\n! A !! B   \n|}\n',
    );
  });

  it("combines template parameters with canonical localization", () => {
    const input =
      "{{Infobox\n| 名称=テスト\n}}\n[[ファイル:A.png|サムネイル|右]]\n[[分類:例]]\n";
    expect(
      formatWikitext(input, {
        level: "experimental",
        formatTemplateParameters: true,
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe(
      "{{Infobox\n| 名称 = テスト\n}}\n[[File:A.png|thumb|right]]\n\n[[Category:例]]\n",
    );
  });

  it("combines interlanguage footer placement with categories", () => {
    expect(
      formatWikitext("[[en:Foo]]\nBody\n[[Category:A]]\n", {
        level: "experimental",
        formatInterlanguageLinks: true,
        interlanguagePlacement: "footer",
      }),
    ).toBe("Body\n\n[[Category:A]]\n\n[[en:Foo]]\n");
  });

  it("combines behavior switch footer and interlanguage footer placement", () => {
    expect(
      formatWikitext("__NOTOC__\n[[en:Foo]]\nBody\n[[Category:A]]\n", {
        level: "experimental",
        formatInterlanguageLinks: true,
        interlanguagePlacement: "footer",
        behaviorSwitchPlacement: "footer",
      }),
    ).toBe("Body\n\n__NOTOC__\n\n[[Category:A]]\n\n[[en:Foo]]\n");
  });

  it("combines experimental table formatting with normal rules", () => {
    expect(
      formatWikitext(
        '==Data==\n{| class="wikitable"\n! A !! B\n|}\n[[Category:A]]\n',
        {
          level: "experimental",
          formatTables: true,
          tableCellSeparatorStyle: "split",
        },
      ),
    ).toBe(
      '== Data ==\n{| class="wikitable"\n! A\n! B\n|}\n\n[[Category:A]]\n',
    );
  });

  it("combines canonical localization with redirect, footer, and file links", () => {
    expect(
      formatWikitext(
        "#転送[[Target]]\n[[ファイル:A.png|サムネイル|右]]\n[[分類:Redirects]]\n",
        { localizedSyntaxStyle: "canonical-english" },
      ),
    ).toBe(
      "#REDIRECT [[Target]]\n[[File:A.png|thumb|right]]\n\n[[Category:Redirects]]\n",
    );
  });
});

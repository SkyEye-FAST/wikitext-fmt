import { describe, expect, it } from "vitest";

import { formatWikitext, formatWikitextSafeDetailed } from "../src/index.js";

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
        tableCellSeparatorStyle: "preserve",
      }),
    ).toBe(
      '{{Infobox\n| name = value\n}}\n{| class="wikitable"\n! A !! B   \n|}\n',
    );
  });

  it("combines template parameter formatting with protected block preservation", () => {
    const input =
      "<nowiki>{{Infobox\n| name=value\n}}</nowiki>\n{{Infobox\n| name=value\n}}\n";
    expect(
      formatWikitext(input, {
        level: "experimental",
        formatTemplateParameters: true,
      }),
    ).toBe(
      "<nowiki>{{Infobox\n| name=value\n}}</nowiki>\n{{Infobox\n| name = value\n}}\n",
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

  it("combines reference formatting with section spacing", () => {
    expect(
      formatWikitext("Intro\n==Refs==\n<references/>\n", {
        level: "experimental",
        formatReferences: true,
        formatSectionSpacing: true,
      }),
    ).toBe("Intro\n\n== Refs ==\n<references />\n");
  });

  it("combines reference formatting with category footer movement", () => {
    expect(
      formatWikitext("[[Category:A]]\n<references/>\nBody\n", {
        level: "experimental",
        formatReferences: true,
      }),
    ).toBe("<references />\nBody\n\n[[Category:A]]\n");
  });

  it("combines reference formatting with template parameter formatting", () => {
    expect(
      formatWikitext('{{Infobox\n| name=value\n}}\n<ref name="x"/>\n', {
        level: "experimental",
        formatTemplateParameters: true,
        formatReferences: true,
      }),
    ).toBe('{{Infobox\n| name = value\n}}\n<ref name="x" />\n');
  });

  it("combines reference formatting with table formatting without changing table internals by reference rule", () => {
    expect(
      formatWikitext('{|\n| <ref name="x"/>\n|}\n<references/>\n', {
        level: "experimental",
        formatTables: true,
        formatReferences: true,
      }),
    ).toBe('{|\n| <ref name="x"/>\n|}\n<references />\n');
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
      '== Data ==\n{| class="wikitable"\n! A \n! B\n|}\n\n[[Category:A]]\n',
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

  it("preserves protected and ignored content with every experimental opt-in", () => {
    const protectedFragments = [
      "<!-- ==Comment== {{T| a = b }} [[Category:Comment]] -->",
      "<nowiki>==Nowiki== {{T| a = b }} [[Category:Nowiki]]</nowiki>",
      "<pre>==Pre==\n{{T| a = b }}</pre>",
      '<syntaxhighlight lang="wikitext">==Code==\n{{T| a = b }}</syntaxhighlight>',
      '<ref name="content">==Reference== {{T| a = b }} [[Category:Ref]]</ref>',
      "<!-- wikitext-fmt-ignore-start -->\n==Ignored==\n{{T| a = b }}\n[[Category:Ignored]]\n<!-- wikitext-fmt-ignore-end -->",
      '{| class="wikitable"\n| <ref name="table"/> || {{T| a = b }}\n|}',
    ];
    const input = `==Outer==\n${protectedFragments.join("\n")}\n[https://example.test  Label]\n<references/>\n[[Category:Outer]]\n`;

    const result = formatWikitextSafeDetailed(input, {
      level: "experimental",
      formatTemplateParameters: true,
      formatSectionSpacing: true,
      formatReferences: true,
      formatExternalLinks: true,
      formatTables: true,
      tableCellSeparatorStyle: "preserve",
      formatInterlanguageLinks: true,
      interlanguagePlacement: "footer",
      localizedSyntaxStyle: "canonical-english",
      behaviorSwitchPlacement: "footer",
    });

    expect(result.warning).toBeUndefined();
    for (const fragment of protectedFragments.slice(0, -1)) {
      expect(result.formatted).toContain(fragment);
    }
    expect(result.formatted).toContain(
      '{| class="wikitable"\n| <ref name="table"/> || {{ T | a = b }}\n|}',
    );
    expect(result.formatted).toContain("== Outer ==");
    expect(result.formatted).toContain("[https://example.test Label]");
    expect(result.formatted).toContain("<references />");
  });
});

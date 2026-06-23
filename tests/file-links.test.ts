import { describe, expect, it } from "vitest";
import generatedAliases from "../src/localization/generated/mediawiki-aliases.json" with { type: "json" };
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import { formatFileLinks } from "../src/rules/fileLinks.js";

const config = getParserConfig("mediawiki");

describe("file/image link formatting", () => {
  it("leaves English file links unchanged except trailing whitespace", () => {
    expect(
      formatWikitext("[[File:Example.png|thumb|right|300px|alt=Example]]   \n"),
    ).toBe("[[File:Example.png|thumb|right|300px|alt=Example]]\n");
  });

  it("matches English File namespace case-insensitively", () => {
    expect(
      formatWikitext("[[file:A.png|thumb]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("[[File:A.png|thumb]]\n");
    expect(
      formatWikitext("[[File:A.png|thumb]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("[[File:A.png|thumb]]\n");
  });

  it("matches namespace aliases with underscores as spaces", () => {
    expect(
      formatWikitext("[[Project_File:A.png|miniX]]\n", {
        localizationSource: "custom",
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: {
          fileNamespaces: ["Project File"],
          imageOptionAliases: { img_thumbnail: ["miniX"] },
        },
      }),
    ).toBe("[[File:A.png|thumb]]\n");
  });

  it("matches custom namespace aliases case-insensitively", () => {
    expect(
      formatWikitext("[[mediax:A.png|miniX]]\n", {
        localizationSource: "custom",
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: {
          fileNamespaces: ["MediaX"],
          imageOptionAliases: { img_thumbnail: ["miniX"] },
        },
      }),
    ).toBe("[[File:A.png|thumb]]\n");
  });

  it("does not treat file talk namespaces as file links", () => {
    const input = "[[File talk:A.png|thumb]]   \n";
    expect(
      formatWikitext(input, { localizedSyntaxStyle: "canonical-english" }),
    ).toBe(input);
  });

  it("preserves localized file namespace and image options by default", () => {
    expect(formatWikitext("[[ファイル:A.png|サムネイル|右|300px]]   \n")).toBe(
      "[[ファイル:A.png|サムネイル|右|300px]]\n",
    );
  });

  it("canonicalizes localized file namespace and simple image options", () => {
    expect(generatedAliases.fileNamespaces).toContain("ファイル");
    expect(generatedAliases.imageOptionAliases.img_thumbnail).toContain(
      "サムネイル",
    );
    expect(generatedAliases.imageOptionAliases.img_right).toContain("右");
    expect(
      formatWikitext("[[ファイル:A.png|サムネイル|右|300px]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("[[File:A.png|thumb|right|300px]]\n");
  });

  it("uses parser-confirmed whole-line file nodes when context is provided", () => {
    const source = "[[文件:A.png|缩略图|右]]\n";
    expect(
      formatFileLinks(
        source,
        {
          localizationSource: "builtin",
          localizedSyntaxStyle: "canonical-english",
          localizationAliases: {},
        },
        createParserContext(source, config),
      ).formatted,
    ).toBe("[[File:A.png|thumb|right]]\n");
  });

  it("ignores a stale file-link parser context for a different source", () => {
    const source = "[[file:A.png|thumb]]\n";
    expect(
      formatFileLinks(
        source,
        {
          localizationSource: "builtin",
          localizedSyntaxStyle: "canonical-english",
          localizationAliases: {},
        },
        createParserContext("Plain text\n", config),
      ).formatted,
    ).toBe("[[File:A.png|thumb]]\n");
  });

  it("canonicalizes left and center options from generated aliases", () => {
    expect(
      formatWikitext("[[文件:A.png|缩略图|左|居中]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("[[File:A.png|thumb|left|center]]\n");
  });

  it("preserves captions, alt text, and link targets", () => {
    expect(
      formatWikitext(
        "[[ファイル:A.png|サムネイル|説明文|代替文=説明|link=Target]]\n",
        { localizedSyntaxStyle: "canonical-english" },
      ),
    ).toBe("[[File:A.png|thumb|説明文|alt=説明|link=Target]]\n");
  });

  it("canonicalizes parameterized image option keywords while preserving values", () => {
    expect(
      formatWikitext(
        "[[ファイル:A.png|代替文=説明|リンク=Target|ページ=2|類別=foo|語言=ja|右上|右上=1.2|300px]]\n",
        { localizedSyntaxStyle: "canonical-english" },
      ),
    ).toBe(
      "[[File:A.png|alt=説明|link=Target|page=2|class=foo|lang=ja|upright|upright=1.2|300px]]\n",
    );
  });

  it("does not canonicalize parameterized image options with extra whitespace", () => {
    expect(
      formatWikitext("[[ファイル:A.png|代替文 =説明|リンク =Target]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("[[File:A.png|代替文 =説明|リンク =Target]]\n");
  });

  it.each([
    "[[File:{{Example}}.png|thumb]]\n",
    "[[File:A.png|thumb]] and [[File:B.png|thumb]]\n",
    "[[File:A.png|thumb|[[Nested]]]]\n",
    "[[File:A.png|thumb|<span>caption</span>]]\n",
    "[[File:A.png|thumb|alt={{Example}}]]\n",
    "[[File:A.png|thumb|link=[[Target]]]]\n",
    "| [[File:A.png|thumb]]\n",
    "Text [[File:A.png|thumb]]\n",
    "[[Page|label]]   \n",
  ])("preserves unsafe file link line %s", (input) => {
    expect(
      formatWikitext(input, { localizedSyntaxStyle: "canonical-english" }),
    ).toBe(input);
  });

  it("supports custom file namespace and image option aliases", () => {
    expect(
      formatWikitext("[[MediaX:A.png|miniX|rechtsX]]\n", {
        localizationSource: "custom",
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: {
          fileNamespaces: ["MediaX"],
          imageOptionAliases: {
            img_thumbnail: ["miniX"],
            img_right: ["rechtsX"],
          },
        },
      }),
    ).toBe("[[File:A.png|thumb|right]]\n");
  });

  it("supports siteinfo file namespace and image option aliases when preloaded", () => {
    expect(
      formatWikitext("[[DateiX:A.png|miniX|rechtsX]]\n", {
        localizationSource: "siteinfo",
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: {
          fileNamespaces: ["DateiX"],
          imageOptionAliases: {
            img_thumbnail: ["miniX"],
            img_right: ["rechtsX"],
          },
        },
      }),
    ).toBe("[[File:A.png|thumb|right]]\n");
  });

  it("reports file link formatting and canonicalization", () => {
    const result = formatWikitextDetailedResult(
      "[[ファイル:A.png|サムネイル|右]]\n",
      { localizedSyntaxStyle: "canonical-english" },
    );
    expect(result.fileLinkDiagnostics).toEqual({
      fileLinksFormatted: 1,
      localizedFileNamespaceAliasesCanonicalized: 1,
      localizedImageOptionsCanonicalized: 2,
    });
  });

  it("can disable file link formatting", () => {
    const input = "[[ファイル:A.png|サムネイル|右]]   \n";
    expect(
      formatWikitext(input, {
        localizedSyntaxStyle: "canonical-english",
        formatFileLinks: false,
      }),
    ).toBe(input);
  });
});

import { describe, expect, it } from "vitest";
import generatedAliases from "../src/localization/generated/mediawiki-aliases.json" with { type: "json" };
import {
  loadSiteInfoAliases,
  loadSiteInfoFormattingData,
  normalizeSiteInfoFormattingPayload,
  normalizeSiteInfoPayload,
} from "../src/localization/siteinfo.js";
import { prepareLocalizationOptions } from "../src/cli/localization.js";
import { parseArgs } from "../src/cli/args.js";
import { formatWikitext, formatWikitextSafe } from "../src/index.js";
import { formatWikitextDetailedResult } from "../src/formatter.js";

describe("MediaWiki localization data", () => {
  it("normalizes raw siteinfo without a network request", () => {
    expect(
      normalizeSiteInfoPayload({
        query: {
          namespaces: [
            { id: 6, canonical: "File", name: "FileX" },
            { id: 14, canonical: "Category", name: "CatX" },
          ],
          namespacealiases: [{ id: 14, name: "CategoryX" }],
          magicwords: [
            { name: "defaultsort", aliases: ["SORTX:"] },
            { name: "redirect", aliases: ["#GO"] },
            { name: "img_alt", aliases: ["altx=$1"] },
            { name: "notoc", aliases: ["__NOTOCX__"] },
          ],
          doubleunderscores: [{ name: "notoc" }],
        },
      }),
    ).toEqual({
      categoryNamespaces: ["CatX", "Category", "CategoryX"],
      fileNamespaces: ["FileX", "File"],
      defaultsortMagicWords: ["SORTX:"],
      redirectMagicWords: ["#GO"],
      imageOptionAliases: { img_alt: ["altx=$1"] },
      behaviorSwitches: { notoc: ["__NOTOCX__"] },
    });
  });

  it("collects only language interwiki flags in API order", () => {
    const data = normalizeSiteInfoFormattingPayload({
      query: {
        namespaces: [
          { id: 6, canonical: "File" },
          { id: 14, canonical: "Category" },
        ],
        interwikimap: [
          { prefix: "en", language: "English" },
          { prefix: "commons", local: true },
          { prefix: "ja", extralanglink: "" },
          { prefix: "mw", localinterwiki: true },
          { prefix: "EN", extralanglink: true },
          { prefix: "  zh-hans  ", language: "中文（简体）" },
          { prefix: "", language: "invalid" },
          { language: "missing prefix" },
          null,
        ],
      },
    });
    expect(data.interlanguagePrefixes).toEqual(["en", "ja", "zh-hans"]);
    expect(data.localizationAliases.categoryNamespaces).toEqual(["Category"]);
  });

  it("preserves an authoritative empty interlanguage prefix list", () => {
    expect(
      normalizeSiteInfoFormattingPayload({
        query: {
          namespaces: [{ id: 14, canonical: "Category" }],
          interwikimap: [
            { prefix: "commons", local: true },
            { prefix: "mw", localinterwiki: true },
          ],
        },
      }).interlanguagePrefixes,
    ).toEqual([]);
  });

  it.each([
    ["[[分类:简体]]", "__无目录__", "{{默认排序:简体}}"],
    ["[[分類:繁體]]", "__無目錄__", undefined],
    ["[[カテゴリ:日本語]]", "__目次非表示__", "{{デフォルトソート:日本語}}"],
    ["[[분류:한국어]]", "__목차숨김__", "{{기본정렬:한국어}}"],
  ])(
    "preserves aliases from MediaWiki core: %s",
    (category, behavior, defaultsort) => {
      const metadata = defaultsort ? `${defaultsort}\n${category}` : category;
      const input = `${category}\n${behavior}\nBody.\n${defaultsort ? `${defaultsort}\n` : ""}`;
      expect(formatWikitext(input, { behaviorSwitchPlacement: "footer" })).toBe(
        `Body.\n\n${behavior}\n\n${metadata}\n`,
      );
    },
  );

  it("rewrites only recognized syntax aliases to canonical English", () => {
    const input =
      "[[分類:Foo|Bar]]\n__目次非表示__\nBody.\n{{デフォルトソート:Example}}\n";
    expect(
      formatWikitext(input, {
        behaviorSwitchPlacement: "footer",
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe(
      "Body.\n\n__NOTOC__\n\n{{DEFAULTSORT:Example}}\n[[Category:Foo|Bar]]\n",
    );
  });

  it("reports canonicalized localized syntax separately from movement", () => {
    const result = formatWikitextDetailedResult(
      "[[分類:Foo]]\n__目次非表示__\nBody.\n{{デフォルトソート:Example}}\n",
      {
        behaviorSwitchPlacement: "footer",
        localizedSyntaxStyle: "canonical-english",
      },
    );
    expect(result.footerDiagnostics).toMatchObject({
      localizedCategoryAliasesCanonicalized: 1,
      localizedDefaultsortAliasesCanonicalized: 1,
      localizedBehaviorSwitchesCanonicalized: 1,
    });
  });

  it("deduplicates behavior switches by emitted value in canonical English footer mode", () => {
    expect(
      formatWikitext("__目次非表示__\n__NOTOC__\nBody.\n", {
        behaviorSwitchPlacement: "footer",
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("Body.\n\n__NOTOC__\n");
  });

  it("leaves unknown, embedded, and category-talk aliases unchanged", () => {
    const input =
      "Text __目次非表示__ here\n[[分類討論:Foo]]\n[[未知分類:Bar]]\n__未知目錄__\n";
    expect(
      formatWikitext(input, { localizedSyntaxStyle: "canonical-english" }),
    ).toBe(input);
  });

  it("uses custom aliases without guessed built-in aliases in custom mode", () => {
    const input =
      "[[CatX:Foo]]\n__NOTOCX__\nBody.\n{{SORTX:Key}}\n[[分類:Unrecognized]]\n";
    expect(
      formatWikitext(input, {
        localizationSource: "custom",
        localizedSyntaxStyle: "canonical-english",
        behaviorSwitchPlacement: "footer",
        localizationAliases: {
          categoryNamespaces: ["CatX"],
          defaultsortMagicWords: ["SORTX:"],
          behaviorSwitches: { notoc: ["NOTOCX"] },
        },
      }),
    ).toBe(
      "Body.\n[[分類:Unrecognized]]\n\n__NOTOC__\n\n{{DEFAULTSORT:Key}}\n[[Category:Foo]]\n",
    );
  });

  it("lets custom behavior aliases override built-in mappings", () => {
    expect(
      formatWikitext("__目次非表示__\n", {
        localizationSource: "builtin",
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: { behaviorSwitches: { toc: ["__目次非表示__"] } },
      }),
    ).toBe("__TOC__\n");
  });

  it("contains specific generated aliases from newly covered MediaWiki core languages", () => {
    expect(generatedAliases.generatedFromLanguages).toEqual(
      expect.arrayContaining([
        "De",
        "Fr",
        "Es",
        "It",
        "Ru",
        "Uk",
        "Pl",
        "Pt",
        "Ar",
      ]),
    );
    expect(generatedAliases.categoryNamespaces).toEqual(
      expect.arrayContaining([
        "Kategorie",
        "Catégorie",
        "Categoría",
        "Категория",
        "تصنيف",
      ]),
    );
    expect(generatedAliases.defaultsortMagicWords).toEqual(
      expect.arrayContaining(["SORTIERUNG:", "SORTUJ"]),
    );
    expect(generatedAliases.behaviorSwitches.forcetoc).toContain(
      "__INHALTSVERZEICHNIS_ERZWINGEN__",
    );

    const input =
      "[[Kategorie:Foo]]\n__INHALTSVERZEICHNIS_ERZWINGEN__\nBody.\n{{SORTIERUNG:Key}}\n";
    expect(
      formatWikitext(input, {
        behaviorSwitchPlacement: "footer",
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("Body.\n\n__FORCETOC__\n\n{{DEFAULTSORT:Key}}\n[[Category:Foo]]\n");
  });

  it("handles generated no-colon defaultsort aliases only with an explicit separator", () => {
    expect(
      formatWikitext("{{SORTUJ:Key}}\n[[Kategoria:Foo]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("{{DEFAULTSORT:Key}}\n[[Category:Foo]]\n");
    expect(
      formatWikitext("{{SORTUJKey}}\n[[Kategoria:Foo]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("{{SORTUJKey}}\n\n[[Category:Foo]]\n");
  });

  it("handles full-width-colon defaultsort aliases from generated MediaWiki data", () => {
    expect(generatedAliases.defaultsortMagicWords).toContain(
      "デフォルトソート：",
    );
    expect(
      formatWikitext("{{デフォルトソート：Key}}\n[[カテゴリ:Foo]]\n", {
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("{{DEFAULTSORT:Key}}\n[[Category:Foo]]\n");
  });

  it("loads namespace and magic-word aliases from mocked siteinfo", async () => {
    let requestedUrl = "";
    const siteData = await loadSiteInfoFormattingData(
      "https://wiki.example/api.php",
      async (input) => {
        requestedUrl = String(input);
        return new Response(
          JSON.stringify({
            query: {
              namespaces: {
                6: { id: 6, canonical: "File", "*": "DateiX" },
                14: { id: 14, canonical: "Category", "*": "KategorieX" },
                15: {
                  id: 15,
                  canonical: "Category talk",
                  "*": "KategorieX talk",
                },
              },
              namespacealiases: [
                { id: 6, "*": "FileX" },
                { id: 14, "*": "CatX" },
                { id: 15, "*": "CatX talk" },
              ],
              magicwords: [
                { name: "defaultsort", aliases: ["SORTX:", "DEFAULTSORT:"] },
                { name: "redirect", aliases: ["#REDIRECTX", "#REDIRECT"] },
                { name: "img_thumbnail", aliases: ["miniX", "thumb"] },
                { name: "img_right", aliases: ["rechtsX", "right"] },
                { name: "notoc", aliases: ["__NOTOCX__", "__NOTOC__"] },
              ],
              doubleunderscores: ["notoc"],
              interwikimap: [
                { prefix: "de", language: "Deutsch" },
                { prefix: "commons", local: true },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    expect(requestedUrl).toContain(
      "siprop=namespaces%7Cnamespacealiases%7Cmagicwords%7Cdoubleunderscores%7Cinterwikimap",
    );
    const aliases = siteData.localizationAliases;
    expect(siteData.interlanguagePrefixes).toEqual(["de"]);
    expect(aliases).toEqual({
      categoryNamespaces: ["KategorieX", "Category", "CatX"],
      fileNamespaces: ["DateiX", "File", "FileX"],
      defaultsortMagicWords: ["SORTX:", "DEFAULTSORT:"],
      redirectMagicWords: ["#REDIRECTX", "#REDIRECT"],
      imageOptionAliases: {
        img_thumbnail: ["miniX", "thumb"],
        img_right: ["rechtsX", "right"],
      },
      behaviorSwitches: { notoc: ["__NOTOCX__", "__NOTOC__"] },
    });
    expect(
      formatWikitext("[[CatX:Foo]]\n__NOTOCX__\nBody.\n{{SORTX:Key}}\n", {
        localizationSource: "siteinfo",
        localizationAliases: aliases,
        localizedSyntaxStyle: "canonical-english",
        behaviorSwitchPlacement: "footer",
      }),
    ).toBe("Body.\n\n__NOTOC__\n\n{{DEFAULTSORT:Key}}\n[[Category:Foo]]\n");
    expect(
      formatWikitext("[[FileX:Example.png|miniX|rechtsX]]\n", {
        localizationSource: "siteinfo",
        localizationAliases: aliases,
        localizedSyntaxStyle: "canonical-english",
      }),
    ).toBe("[[File:Example.png|thumb|right]]\n");
  });

  it("uses siteinfo prefixes only when CLI or config did not set them", async () => {
    const loader = async () => ({
      localizationAliases: { categoryNamespaces: ["CatX"] },
      interlanguagePrefixes: ["de", "ja"],
    });
    const baseCli = parseArgs([
      "--localization-source",
      "siteinfo",
      "--site-api",
      "https://wiki.example/api.php",
      "page.wiki",
    ]);

    await expect(
      prepareLocalizationOptions(
        baseCli,
        { localizationSource: "siteinfo" },
        loader,
      ),
    ).resolves.toMatchObject({
      localizationSource: "custom",
      localizationAliases: { categoryNamespaces: ["CatX"] },
      interlanguagePrefixes: ["de", "ja"],
    });
    await expect(
      prepareLocalizationOptions(
        baseCli,
        {
          localizationSource: "siteinfo",
          interlanguagePrefixes: ["config-prefix"],
        },
        loader,
      ),
    ).resolves.toMatchObject({
      interlanguagePrefixes: ["config-prefix"],
    });

    const cliOverride = parseArgs([
      "--localization-source",
      "siteinfo",
      "--site-api",
      "https://wiki.example/api.php",
      "--interlanguage-prefixes",
      "cli-prefix",
      "page.wiki",
    ]);
    await expect(
      prepareLocalizationOptions(cliOverride, cliOverride, loader),
    ).resolves.toMatchObject({
      interlanguagePrefixes: ["cli-prefix"],
    });
  });

  it("does not replace an empty siteinfo prefix list with defaults", async () => {
    const options = parseArgs([
      "--localization-source",
      "siteinfo",
      "--site-api",
      "https://wiki.example/api.php",
      "page.wiki",
    ]);
    const prepared = await prepareLocalizationOptions(
      options,
      { localizationSource: "siteinfo" },
      async () => ({
        localizationAliases: { categoryNamespaces: ["Category"] },
        interlanguagePrefixes: [],
      }),
    );
    expect(prepared.interlanguagePrefixes).toEqual([]);
  });

  it("fails closed when siteinfo aliases were not loaded", () => {
    const input = "[[Category:Foo]]\n";
    const result = formatWikitextSafe(input, {
      localizationSource: "siteinfo",
    });
    expect(result.formatted).toBe(input);
    expect(result.warning).toMatch(
      /Siteinfo localization aliases were not loaded/u,
    );
  });

  it("reports siteinfo fetch failures without fallback", async () => {
    await expect(
      loadSiteInfoAliases("https://wiki.example/api.php", async () => {
        throw new Error("network unavailable");
      }),
    ).rejects.toThrow(
      /Could not fetch MediaWiki siteinfo.*network unavailable/u,
    );
  });
});

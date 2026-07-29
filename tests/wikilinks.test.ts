import Parser from "wikiparser-node";
import bundledDefaultConfig from "wikiparser-node/config/default.json" with {
  type: "json",
};
import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  verifyStructuralEquivalence,
} from "../src/index.js";
import { resolveOptions } from "../src/options.js";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import { formatWikilinks } from "../src/rules/wikilinks.js";

const config = getParserConfig("mediawiki");
const directOptions = {
  interlanguagePrefixes: resolveOptions().interlanguagePrefixes,
};

describe("ordinary wikilink formatting", () => {
  it.each([
    ["[[a_b_c|a]]", "[[a b c|a]]"],
    ["[[a_b_c]]", "[[a b c]]"],
    ["[[a_b_c|a_b_c]]", "[[a b c|a_b_c]]"],
    ["[[Help:a_b_c|help]]", "[[Help:a b c|help]]"],
    ["[[Template:a_b_c|template]]", "[[Template:a b c|template]]"],
    ["[[a_b/c_d|label]]", "[[a b/c d|label]]"],
    [
      "[[Page_Name#Section_Name|label]]",
      "[[Page Name#Section_Name|label]]",
    ],
    ["[[#Section_Name]]", "[[#Section_Name]]"],
    ["[[Page_Name|]]", "[[Page Name|]]"],
    [
      "[[:Category:Some_Name|label]]",
      "[[:Category:Some Name|label]]",
    ],
    ["#REDIRECT [[Page_Name]]", "#REDIRECT [[Page Name]]"],
    ["[[a__b]]", "[[a  b]]"],
    ["[[a___b]]", "[[a   b]]"],
    ["[[ _Page_ ]]", "[[  Page  ]]"],
    ["[[Page_Name]]trail", "[[Page Name]]trail"],
  ])("normalizes only the page-title portion of %s", (input, expected) => {
    expect(formatWikitext(input)).toBe(expected);
  });

  it("preserves non-target semantic fields and excluded structures", () => {
    const input = [
      "[[File:Example_Name.png|thumb|Caption_text]]",
      "[[Category:Some_Name|Sort_key]]",
      "[[ja:Some_Page]]",
      "[https://example.test/a_b]",
      "{{Template_Name|value=a_b}}",
      '<span id="Section_Name">',
      "",
    ].join("\n");
    expect(formatWikitext(input, { formatCategories: false })).toBe(input);
  });

  it("formats ordinary links in supported surrounding structures", () => {
    const input = [
      "Prose [[Page_Name|label]] trail",
      "* [[List_Page]]",
      "== [[Heading_Page]] ==",
      "{{T|link=[[Parameter_Page]]}}",
      "",
    ].join("\n");
    const expected = [
      "Prose [[Page Name|label]] trail",
      "* [[List Page]]",
      "== [[Heading Page]] ==",
      "{{T|link=[[Parameter Page]]}}",
      "",
    ].join("\n");
    expect(formatWikitext(input, { formatTemplates: false })).toBe(expected);
  });

  it("preserves links in protected blocks", () => {
    const input = [
      "{|",
      "| [[Table_Page]]",
      "|}",
      "<ref>[[Reference_Page]]</ref>",
      "<!-- [[Comment_Page]] -->",
      "<nowiki>[[Nowiki_Page]]</nowiki>",
      "<pre>[[Pre_Page]]</pre>",
      "<source>[[Source_Page]]</source>",
      "",
    ].join("\n");
    expect(formatWikitext(input)).toBe(input);
  });

  it("is disabled explicitly and by the safe-only reliability ceiling", () => {
    expect(formatWikitext("[[Page_Name]]", { formatWikilinks: false })).toBe(
      "[[Page_Name]]",
    );
    expect(formatWikitext("[[Page_Name]]", { level: "safe" })).toBe(
      "[[Page_Name]]",
    );
  });

  it("is idempotent", () => {
    const once = formatWikitext("[[Page_Name#Section_Name|display_text]]");
    expect(formatWikitext(once)).toBe(once);
  });

  it("reports focused eligibility, replacement, fragment, and exclusion counts", () => {
    const input = [
      "[[Page_Name]]",
      "[[Page_Name#Section_Name]]",
      "[[Already Canonical]]",
      "[[File:Example_Name.png|thumb]]",
      "[[Category:Some_Name|Sort_key]]",
      "[[ja:Some_Page]]",
      "[[#Section_Name]]",
      "",
    ].join("\n");
    const result = formatWikitextDetailedResult(input, {
      formatCategories: false,
      formatFileLinks: false,
      formatTemplates: false,
    });
    expect(result.wikilinkDiagnostics).toEqual({
      wikilinksInspected: 7,
      wikilinksEligible: 3,
      wikilinksFormatted: 2,
      underscoresReplaced: 2,
      wikilinksWithFragmentsFormatted: 1,
      wikilinksSkippedUnsafe: 4,
      skipReasons: {
        "file-link": 1,
        "category-assignment": 1,
        "interwiki-or-interlanguage": 1,
        "fragment-only": 1,
      },
    });
  });

  it("skips complex and stale parser targets", () => {
    const complex = "[[Page_{{Template_Name}}_Name]]";
    expect(
      formatWikilinks(
        complex,
        directOptions,
        createParserContext(complex, config),
      ),
    ).toMatchObject({
      formatted: complex,
      diagnostics: {
        wikilinksInspected: 1,
        wikilinksEligible: 0,
        wikilinksSkippedUnsafe: 1,
        skipReasons: { "unstable-parser-target": 1 },
      },
    });

    const source = "[[Page_Name]]";
    expect(
      formatWikilinks(
        source,
        directOptions,
        createParserContext("Plain text", config),
      ),
    ).toMatchObject({
      formatted: source,
      diagnostics: { wikilinksInspected: 0 },
    });
  });

  it("uses the active parser's interwiki classification", () => {
    const interwikiConfig = Parser.getConfig({
      ...bundledDefaultConfig,
      interwiki: ["w"],
    });
    const source = "[[w:Some_Page]]";
    expect(
      formatWikilinks(
        source,
        { interlanguagePrefixes: [] },
        createParserContext(source, interwikiConfig),
      ),
    ).toMatchObject({
      formatted: source,
      diagnostics: {
        wikilinksSkippedUnsafe: 1,
        skipReasons: { "interwiki-or-interlanguage": 1 },
      },
    });
  });
});

describe("wikilink structural equivalence", () => {
  const options = resolveOptions();

  it.each([
    ["[[Page_Name]]", "[[Page Name]]"],
    [
      "[[Page_Name#Section_Name|label]]",
      "[[Page Name#Section_Name|label]]",
    ],
    [
      "{{T|link=[[Page_Name|label]]}}",
      "{{T|link=[[Page Name|label]]}}",
    ],
    ["== [[Page_Name]] ==", "== [[Page Name]] =="],
    ["#REDIRECT [[Page_Name]]", "#REDIRECT [[Page Name]]"],
  ])("accepts title-only underscore normalization", (before, after) => {
    expect(
      verifyStructuralEquivalence(before, after, config, "document", options),
    ).toEqual({ equivalent: true, structure: "document" });
  });

  it.each([
    ["display labels", "[[Page_Name|display_one]]", "[[Page Name|display two]]"],
    [
      "fragments",
      "[[Page_Name#Section_Name]]",
      "[[Page Name#Section Other]]",
    ],
    [
      "category sort keys",
      "[[Category:Some_Name|Sort_key]]",
      "[[Category:Some_Name|Sort key]]",
    ],
    [
      "file options",
      "[[File:Example_Name.png|thumb|Caption_text]]",
      "[[File:Example_Name.png|thumb|Caption text]]",
    ],
    ["interlanguage targets", "[[ja:Some_Page]]", "[[ja:Some Page]]"],
  ])("keeps %s strict", (_name, before, after) => {
    expect(
      verifyStructuralEquivalence(before, after, config, "document", options),
    ).toMatchObject({ equivalent: false, structure: "document" });
  });

  it("keeps wikilink targets strict when the rule is disabled", () => {
    expect(
      verifyStructuralEquivalence(
        "[[Page_Name]]",
        "[[Page Name]]",
        config,
        "document",
        resolveOptions({ formatWikilinks: false }),
      ),
    ).toMatchObject({ equivalent: false, structure: "document" });
  });

  it("does not weaken template-only equivalence", () => {
    expect(
      verifyStructuralEquivalence(
        "{{T|link=[[Page_Name]]}}",
        "{{T|link=[[Page Name]]}}",
        config,
        "templates",
      ),
    ).toMatchObject({ equivalent: false, structure: "templates" });
  });
});

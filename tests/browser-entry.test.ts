import { describe, expect, it } from "vitest";

import * as browser from "../src/browser.js";
import * as node from "../src/index.js";
import type { FormatOptions } from "../src/options.js";

const parityCases: ReadonlyArray<
  readonly [name: string, source: string, options?: FormatOptions]
> = [
  ["canonical input", "== Title ==\n"],
  ["headings", "==Title==\n"],
  ["templates", "{{T|a=1|b=2}}\n"],
  ["template parameters", "{{T| a = 1 | b = 2 }}\n", { profile: "aggressive" }],
  ["tables", '{| class="wikitable"\n|a||b\n|}\n'],
  ["lists", "*item\n"],
  ["categories", "Text\n[[Category:Example]]\n"],
  ["wikilinks", "[[Main_Page]]\n"],
  ["file links", "[[File:Example.png|thumb|Caption]]\n"],
  ["redirects", "#redirect [[Target]]\n"],
  ["behavior switches", "Text\n__NOTOC__\n"],
  ["comments", "Text<!-- preserve -->\n"],
  [
    "references and extension tags",
    'Text<ref name="source"> citation </ref>\n',
    { profile: "aggressive" },
  ],
  ["malformed source", "{{unclosed\n"],
  ["CRLF input", "==Title==\r\n"],
];

describe("browser entry", () => {
  it.each(parityCases)(
    "matches the Node safety pipeline for %s",
    (_name, source, options = {}) => {
      const nodeResult = node.formatWikitextSafeDetailed(source, options);
      const browserResult = browser.formatWikitextSafeDetailed(source, options);

      expect(browserResult).toEqual(nodeResult);
      expect(browser.formatWikitextResult(source, options)).toEqual(
        node.formatWikitextResult(source, options),
      );
    },
  );

  it.each([undefined, "mediawiki", "default"] as const)(
    "supports the bundled default parser configuration %s",
    (parserConfig) => {
      const source = "==Title==\n";
      const result = browser.formatWikitextSafe(source, { parserConfig });
      expect(result).toEqual({ formatted: "== Title ==\n" });
      expect(result).toEqual(node.formatWikitextSafe(source, { parserConfig }));
    },
  );

  it.each(["enwiki", "./parser.json", "/tmp/parser.json"])(
    "fails closed for unsupported parser configuration %s",
    (parserConfig) => {
      const source = "==Title==\n";
      const compact = browser.formatWikitextSafe(source, { parserConfig });
      const detailed = browser.formatWikitextSafeDetailed(source, {
        parserConfig,
      });

      expect(compact.formatted).toBe(source);
      expect(compact.failure).toMatchObject({
        code: "unsupported-parser-config",
        stage: "parser-config",
      });
      expect(detailed.formatted).toBe(source);
      expect(detailed.failure).toMatchObject({
        code: "unsupported-parser-config",
        stage: "parser-config",
      });
      expect(browser.formatWikitext(source, { parserConfig })).toBe(source);
    },
  );

  it("returns idempotent output from the safe API", () => {
    const source = "==Title==\n*item\n{{T|a=1|b=2}}\n";
    const first = browser.formatWikitextSafeDetailed(source);
    expect(first.failure).toBeUndefined();

    const second = browser.formatWikitextSafeDetailed(first.formatted);
    expect(second.failure).toBeUndefined();
    expect(second.formatted).toBe(first.formatted);
  });

  it("exports browser-safe formatter metadata and helpers", () => {
    expect(browser.defaultOptions.parserConfig).toBe("mediawiki");
    expect(browser.ruleLevels.tables).toBe("normal");
    expect(browser.classifyParserFunction("#if").classification).toBe(
      "opaque-preserve",
    );
    expect(browser.loadSiteInfoAliases).toBeTypeOf("function");
    expect(browser.normalizeSiteInfoPayload).toBeTypeOf("function");
  });

  it("keeps shared Node and browser public exports available", () => {
    for (const name of [
      "formatWikitext",
      "formatWikitextDetailedResult",
      "formatWikitextResult",
      "formatWikitextSafe",
      "formatWikitextSafeDetailed",
      "defaultOptions",
      "ruleLevels",
      "classifyParserFunction",
      "loadSiteInfoAliases",
      "normalizeSiteInfoPayload",
    ] as const) {
      expect(browser[name]).toBeDefined();
      expect(node[name]).toBeDefined();
    }
    expect(node.verifyStructuralEquivalence).toBeTypeOf("function");
    expect(node.loadConfig).toBeTypeOf("function");
  });
});

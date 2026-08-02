import { describe, expect, it } from "vitest";

import * as browser from "../src/browser.js";
import * as node from "../src/index.js";
import type { FormatOptions } from "../src/options.js";
import { browserParserRuntime } from "../src/parser.browser.js";
import { nodeParserRuntime } from "../src/parser.node.js";
import type { ParserRuntime } from "../src/parserRuntime.js";

const parityCases: ReadonlyArray<
  readonly [name: string, source: string, options?: FormatOptions]
> = [
  ["canonical input", "== Title ==\n"],
  ["headings", "==Title==\n"],
  ["templates", "{{T|a=1|b=2}}\n"],
  ["template parameters", "{{T| a = 1 | b = 2 }}\n", { profile: "production" }],
  ["tables", '{|class="wikitable"\n|-class="row"\n|+Caption\n| A || B\n|}\n'],
  [
    "table caption attributes",
    '{|\n|+style="text-align:center"|Caption\n| A\n|}\n',
  ],
  [
    "table separator preservation",
    '{|class="wikitable"\n|-class="row"\n|+Caption\n|A||B\n|}\n',
    { tableCellSeparatorStyle: "preserve" },
  ],
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
    { profile: "production" },
  ],
  [
    "standalone reference",
    '<ref name="source"/>\n',
    { profile: "production" },
  ],
  [
    "reference before prose",
    '<ref name="source"/>\nParagraph\n',
    { profile: "production" },
  ],
  [
    "interlanguage footer link",
    "[[en:Example]]\n\nBody\n",
    { profile: "production" },
  ],
  [
    "generic interwiki remains in place",
    "[[commons:Example]]\nBody\n",
    { profile: "production" },
  ],
  [
    "labelled interlanguage link remains in place",
    "[[en:Example|label]]\nBody\n",
    { profile: "production" },
  ],
  [
    "inline interlanguage link remains in place",
    "Body [[en:Example]]\n",
    { profile: "production" },
  ],
  [
    "nested interlanguage link remains in place",
    "{{T|value=[[en:Example]]}}\nBody\n",
    { profile: "production" },
  ],
  ["malformed source", "{{unclosed\n"],
  ["CRLF input", "==Title==\r\n"],
];

function parserSnapshot(runtime: ParserRuntime) {
  const session = runtime.createSession("mediawiki", {
    interwikiPrefixes: ["en"],
  });
  const root = session.parse(
    [
      '<ref name="source"/>',
      "[[en:Example]]",
      "[[Category:Example]]",
      "[[File:Example.png|thumb]]",
      "#REDIRECT [[Target]]",
      "__NOTOC__",
      "{{#if:x|yes|no}}",
      "{{T|a=1}}",
      "{|",
      "| A",
      "|}",
      "",
    ].join("\n"),
  );
  const selectors = [
    "ext",
    "link",
    "category",
    "file",
    "redirect-target",
    "double-underscore",
    "magic-word",
    "template",
    "table",
  ];
  return {
    config: {
      doubleUnderscore: session.config.doubleUnderscore,
      ext: session.config.ext,
      functionHook: session.config.functionHook,
      html: session.config.html,
      img: session.config.img,
      interwiki: session.config.interwiki,
      namespaces: session.config.namespaces,
      nsid: session.config.nsid,
      parserFunction: session.config.parserFunction,
      protocol: session.config.protocol,
      redirection: session.config.redirection,
      variable: session.config.variable,
      variants: session.config.variants,
    },
    nodes: Object.fromEntries(
      selectors.map((selector) => [
        selector,
        root.querySelectorAll(selector).map((value) => {
          const node = value as unknown as {
            interwiki?: unknown;
            type?: unknown;
            toString(): string;
          };
          return {
            interwiki:
              typeof node.interwiki === "string" ? node.interwiki : "",
            text: node.toString(),
            type: node.type,
          };
        }),
      ]),
    ),
  };
}

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

  it("keeps default and production parser-confirmed reference and interlanguage behavior", () => {
    const reference = browser.formatWikitextSafeDetailed('<ref name="a"/>\n', {
      profile: "production",
    });
    expect(reference).toMatchObject({
      formatted: '<ref name="a" />\n',
      referenceDiagnostics: {
        referenceLinesSkippedUnsafe: 0,
        referencesFormatted: 1,
      },
    });

    const input = "[[en:Example]]\n\nBody\n";
    expect(browser.formatWikitextSafeDetailed(input)).toMatchObject({
      formatted: input,
      footerDiagnostics: { interlanguageLinksInspected: 0 },
    });
    const production = browser.formatWikitextSafeDetailed(input, {
      profile: "production",
    });
    expect(production).toMatchObject({
      formatted: "Body\n\n[[en:Example]]\n",
      footerDiagnostics: {
        interlanguageLinksEligible: 1,
        interlanguageLinksMoved: 1,
        interlanguageLinksSkipped: 0,
      },
    });
    expect(
      browser.formatWikitextSafeDetailed(production.formatted, {
        profile: "production",
      }).formatted,
    ).toBe(production.formatted);
  });

  it("uses the same default parser configuration and classifications as Node", () => {
    expect(parserSnapshot(browserParserRuntime)).toEqual(
      parserSnapshot(nodeParserRuntime),
    );
    for (const name of [
      "#if",
      "#ifeq",
      "#switch",
      "#expr",
      "#tag",
      "#invoke",
      "#site-specific",
    ]) {
      expect(browser.classifyParserFunction(name)).toEqual(
        node.classifyParserFunction(name),
      );
    }
  });

  it("exports browser-safe formatter metadata and helpers", () => {
    expect(browser.defaultOptions.parserConfig).toBe("mediawiki");
    expect(browser.resolveFormatProfile("production")).toEqual(
      node.resolveFormatProfile("production"),
    );
    expect(browser.ruleLevels.tables).toBe("normal");
    expect(browser.classifyParserFunction("#if").classification).toBe(
      "opaque-preserve",
    );
    expect(browser.loadSiteInfoAliases).toBeTypeOf("function");
    expect(browser.normalizeSiteInfoPayload).toBeTypeOf("function");
    expect(browser.validateProjectConfig).toBeTypeOf("function");
    expect(browser.normalizeSiteConfigurationSnapshot).toBeTypeOf("function");
    expect(browser.serializeSiteConfigurationSnapshot).toBeTypeOf("function");
  });

  it("keeps shared Node and browser public exports available", () => {
    for (const name of [
      "formatWikitext",
      "formatWikitextDetailedResult",
      "formatWikitextResult",
      "formatWikitextSafe",
      "formatWikitextSafeDetailed",
      "defaultOptions",
      "formatProfiles",
      "getFormatProfileOverrides",
      "resolveFormatProfile",
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
    expect(node.loadProjectConfig).toBeTypeOf("function");
    expect(node.resolveProjectConfiguration).toBeTypeOf("function");
    expect("verifyStructuralEquivalence" in browser).toBe(false);
    expect("loadConfig" in browser).toBe(false);
    expect("loadProjectConfig" in browser).toBe(false);
    expect("resolveProjectConfiguration" in browser).toBe(false);
  });
});

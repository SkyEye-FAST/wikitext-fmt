import { describe, expect, it } from "vitest";

import { formatWikitext } from "../src/index.js";
import {
  createNodeParserSession,
  getParserConfig,
  nodeParserRuntime,
} from "../src/parser.js";
import {
  formatPageFooter,
  isStandaloneBehaviorSwitchLine,
} from "../src/rules/categories.js";

const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);
const interlanguageSession = nodeParserRuntime.createSession("mediawiki", {
  interwikiPrefixes: ["en"],
});
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
      formatPageFooter(session.createContext(source), {
        formatCategories: true,
        formatBehaviorSwitches: true,
        behaviorSwitchPlacement: "footer",
        ...localization,
        formatInterlanguageLinks: false,
        interlanguagePlacement: "preserve",
        interlanguagePrefixes: [],
      }).formatted,
    ).toBe(source);
  });

  it("preserves footer metadata inside templates", () => {
    const source =
      "{{Foo|category=[[Category:Inside]]|sort={{DEFAULTSORT:Inside}}|language=[[en:Inside]]}}\nBody\n[[Category:Outside]]\n";
    expect(
      formatPageFooter(interlanguageSession.createContext(source), {
        formatCategories: true,
        formatBehaviorSwitches: false,
        behaviorSwitchPlacement: "preserve",
        formatInterlanguageLinks: true,
        interlanguagePlacement: "footer",
        interlanguagePrefixes: ["en"],
        ...localization,
      }).formatted,
    ).toBe(
      "{{Foo|category=[[Category:Inside]]|sort={{DEFAULTSORT:Inside}}|language=[[en:Inside]]}}\nBody\n\n[[Category:Outside]]\n",
    );
  });

  it("produces the same footer output from equivalent current contexts", () => {
    const source =
      "{{Foo|category=[[Category:Inside]]}}\nBody\n[[Category:Outside]]\n";
    const options = {
      formatCategories: true,
      formatBehaviorSwitches: false,
      behaviorSwitchPlacement: "preserve",
      formatInterlanguageLinks: false,
      interlanguagePlacement: "preserve",
      interlanguagePrefixes: [],
      ...localization,
    } satisfies Parameters<typeof formatPageFooter>[1];
    expect(formatPageFooter(session.createContext(source), options).formatted).toBe(
      formatPageFooter(session.createContext(source), options).formatted,
    );
  });

  it("moves parser-confirmed English category lines with explicit context", () => {
    const source = "[[Category:A]]\nBody\n";
    expect(
      formatPageFooter(
        session.createContext(source),
        {
          formatCategories: true,
          formatBehaviorSwitches: false,
          behaviorSwitchPlacement: "preserve",
          formatInterlanguageLinks: false,
          interlanguagePlacement: "preserve",
          interlanguagePrefixes: [],
          ...localization,
        },
      ).formatted,
    ).toBe("Body\n\n[[Category:A]]\n");
  });

  it("handles localized category aliases known to the parser", () => {
    const source = "Body\n[[分類:歌曲|示例]]\n";
    expect(
      formatPageFooter(
        session.createContext(source),
        {
          formatCategories: true,
          formatBehaviorSwitches: false,
          behaviorSwitchPlacement: "preserve",
          formatInterlanguageLinks: false,
          interlanguagePlacement: "preserve",
          interlanguagePrefixes: [],
          ...localization,
        },
      ).formatted,
    ).toBe("Body\n\n[[分類:歌曲|示例]]\n");
  });

  it("keeps custom category aliases working through the line fallback", () => {
    const source = "[[CatX:Foo]]\nBody\n";
    expect(
      formatPageFooter(
        session.createContext(source),
        {
          formatCategories: true,
          formatBehaviorSwitches: false,
          behaviorSwitchPlacement: "preserve",
          formatInterlanguageLinks: false,
          interlanguagePlacement: "preserve",
          interlanguagePrefixes: [],
          localizationSource: "custom",
          localizedSyntaxStyle: "canonical-english",
          localizationAliases: { categoryNamespaces: ["CatX"] },
        },
      ).formatted,
    ).toBe("Body\n\n[[Category:Foo]]\n");
  });

  it("requires callers to recreate context for a different source", () => {
    const staleSource = "{{Foo|category=[[Category:Inside]]}}\nBody\n";
    const source = "Body\n[[Category:Outside]]\n";
    expect(session.createContext(staleSource).source).not.toBe(source);
    expect(
      formatPageFooter(
        session.createContext(source),
        {
          formatCategories: true,
          formatBehaviorSwitches: false,
          behaviorSwitchPlacement: "preserve",
          formatInterlanguageLinks: false,
          interlanguagePlacement: "preserve",
          interlanguagePrefixes: [],
          ...localization,
        },
      ).formatted,
    ).toBe("Body\n\n[[Category:Outside]]\n");
  });

  it("does not move inline interlanguage-like links", () => {
    const source = "Body [[en:Inline]]\n[[en:Footer]]\n";
    expect(
      formatPageFooter(interlanguageSession.createContext(source), {
        formatCategories: false,
        formatBehaviorSwitches: false,
        behaviorSwitchPlacement: "preserve",
        formatInterlanguageLinks: true,
        interlanguagePlacement: "footer",
        interlanguagePrefixes: ["en"],
        ...localization,
      }).formatted,
    ).toBe("Body [[en:Inline]]\n\n[[en:Footer]]\n");
  });

  it("does not move inline category-like links", () => {
    const source = "Body [[Category:Inline]]\n[[Category:Footer]]\n";
    expect(
      formatPageFooter(
        session.createContext(source),
        {
          formatCategories: true,
          formatBehaviorSwitches: false,
          behaviorSwitchPlacement: "preserve",
          formatInterlanguageLinks: false,
          interlanguagePlacement: "preserve",
          interlanguagePrefixes: [],
          ...localization,
        },
      ).formatted,
    ).toBe("Body [[Category:Inline]]\n\n[[Category:Footer]]\n");
  });

  it("uses parser context for the current source snapshot after earlier rules change text", () => {
    expect(
      formatWikitext(
        "__NOTOC__   \n[[File:A.png|thumb]]   \nBody\n[[Category:A]]\n",
        {
          behaviorSwitchPlacement: "footer",
        },
      ),
    ).toBe("[[File:A.png|thumb]]\nBody\n\n__NOTOC__\n\n[[Category:A]]\n");
  });

  it("orders switches, DEFAULTSORT aliases, and categories conservatively", () => {
    const source =
      "[[Category:B]]\n__NOTOC__   \nBody\n{{DEFAULTSORTKEY:Example}}   \n__NOINDEX__\n";
    const result = formatPageFooter(session.createContext(source), {
      formatCategories: true,
      formatBehaviorSwitches: true,
      behaviorSwitchPlacement: "footer",
      ...localization,
      formatInterlanguageLinks: false,
      interlanguagePlacement: "preserve",
      interlanguagePrefixes: [],
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

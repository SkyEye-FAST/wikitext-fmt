import { describe, expect, it } from "vitest";

import {
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
  verifyStructuralEquivalence,
} from "../src/index.js";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.node.js";
import { formatTemplates } from "../src/rules/templates.node.js";
import { readRealPage } from "./helpers/realPages.js";

const config = getParserConfig("mediawiki");
const HISTORICAL_FIXTURE_TIMEOUT_MS = 15_000;

function expectStableTemplateFormatting(
  source: string,
  expectedFragment: string,
): string {
  const once = formatWikitextDetailedResult(source);
  expect(once.failure).toBeUndefined();
  expect(once.warning).toBeUndefined();
  expect(once.templateParameterDiagnostics.convergenceLimitReached).toBe(false);
  expect(once.formatted).toContain(expectedFragment);

  const twice = formatWikitextDetailedResult(once.formatted);
  expect(twice.failure).toBeUndefined();
  expect(twice.warning).toBeUndefined();
  expect(twice.formatted).toBe(once.formatted);

  const safe = formatWikitextSafeDetailed(source);
  expect(safe.failure).toBeUndefined();
  expect(safe.warning).toBeUndefined();
  expect(safe.formatted).toBe(once.formatted);
  expect(
    verifyStructuralEquivalence(
      source,
      once.formatted,
      config,
      "templates",
    ),
  ).toEqual({ equivalent: true, structure: "templates" });
  return once.formatted;
}

describe("simple template formatting parser context", () => {
  it("produces the same output with an explicit parser context", () => {
    const source = "{{Foo|a=1|b=2}}\n";
    expect(
      formatTemplates(source, config, 120, createParserContext(source, config)),
    ).toBe(formatTemplates(source, config, 120));
  });

  it("ignores a stale parser context for a different source", () => {
    expect(
      formatTemplates(
        "{{Foo|a=1}}\n",
        config,
        120,
        createParserContext("Plain text\n", config),
      ),
    ).toBe("{{Foo|a=1}}\n");
  });
});

describe("nested multiline template formatting", () => {
  it("removes indentation left after a collapsed parameter line break", () => {
    const source = `{{navbox
| list1 =
  {{navbox subgroup
  | group1 = Alpha
  }}
}}`;

    const formatted = expectStableTemplateFormatting(
      source,
      "| list1 = {{navbox subgroup\n",
    );
    expect(formatted).not.toMatch(/\| list1 = {2,}\{\{navbox subgroup/u);
  });

  it("converges through multiple nested navbox levels in one call", () => {
    const source = `{{navbox
| list1 =
  {{navbox subgroup
  | list1 =
    {{navbox subgroup
    | group1 = Alpha
    }}
  }}
}}`;

    const formatted = expectStableTemplateFormatting(
      source,
      "| list1 = {{navbox subgroup\n",
    );
    expect(
      formatted.match(/\| list1 = \{\{navbox subgroup/gmu),
    ).toHaveLength(2);
    expect(formatted).not.toMatch(/\| list1 = {2,}\{\{navbox subgroup/u);
  });

  it.each([
    {
      name: "wiki list",
      value: "  * one\n  * two",
      expected: "| value =\n  * one\n  * two",
    },
    {
      name: "table",
      value: "{|\n|-\n| cell\n|}",
      expected: "| value =\n{|\n|-\n| cell\n|}",
    },
    {
      name: "heading",
      value: "== Heading ==",
      expected: "| value =\n== Heading ==",
    },
  ])(
    "preserves the leading line break for a $name value",
    ({ value, expected }) => {
      expectStableTemplateFormatting(
        `{{Example
| value =
${value}
}}`,
        expected,
      );
    },
  );
});

describe("historical nested template regressions", () => {
  it.each([
    {
      revid: 18228,
      fixture: "revid-18228-partner-nav.wiki",
      stableLength: 2297,
    },
    {
      revid: 18232,
      fixture: "revid-18232-story-nav-mobile.wiki",
      stableLength: 2897,
    },
    {
      revid: 17041,
      fixture: "revid-17041-pack-nav.wiki",
      stableLength: 3751,
    },
  ])(
    "formats revid=$revid to a structurally equivalent fixed point",
    async ({ fixture, stableLength }) => {
      // MediaWiki stored these revisions without a final line break. Repository
      // text fixtures conventionally include one, so remove only that fixture byte.
      const source = (await readRealPage(fixture)).replace(/\n$/u, "");
      const formatted = expectStableTemplateFormatting(
        source,
        "| list1 = {{navbox subgroup\n",
      );

      expect(formatted).toHaveLength(stableLength);
      expect(formatted).not.toMatch(/\| list1 = {2,}\{\{navbox subgroup/u);
    },
    HISTORICAL_FIXTURE_TIMEOUT_MS,
  );
});

import { describe, expect, it } from "vitest";

import {
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
  verifyStructuralEquivalence,
} from "../src/index.js";
import { createNodeParserSession, getParserConfig } from "../src/parser.js";
import { formatTemplates } from "../src/rules/templates.js";
import { readRealPage } from "./helpers/realPages.js";

const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);
const HISTORICAL_FIXTURE_TIMEOUT_MS = 15_000;

function expectStableTemplateFormatting(
  source: string,
  expectedFragment: string,
): string {
  const once = formatWikitextDetailedResult(source);
  expect(once.failure).toBeUndefined();
  expect(once.warning).toBeUndefined();
  expect(once.templateDiagnostics.convergenceLimitReached).toBe(false);
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
  it("produces stable output from equivalent current contexts", () => {
    const source = "{{Foo|a=1|b=2}}\n";
    expect(formatTemplates(session.createContext(source), 120)).toBe(
      formatTemplates(session.createContext(source), 120),
    );
  });

  it("requires callers to recreate context for a different source", () => {
    const source = "{{Foo|a=1}}\n";
    const staleContext = session.createContext("Plain text\n");
    expect(staleContext.source).not.toBe(source);
    expect(formatTemplates(session.createContext(source), 120)).toBe(source);
  });
});

describe("nested multiline template formatting", () => {
  it("keeps a nested block template on its own indented line", () => {
    const source = `{{navbox
| list1 =
      {{navbox subgroup
|group1=Alpha
}}
}}`;

    expect(expectStableTemplateFormatting(source, "{{navbox")).toBe(
      `{{navbox
| list1 =
  {{navbox subgroup
  | group1 = Alpha
  }}
}}`,
    );
  });

  it("indents a nested template that starts on its parameter line", () => {
    const source = `{{navbox
| list1 = {{navbox subgroup
| group1 = Alpha
}}
| below = text
}}`;

    expect(expectStableTemplateFormatting(source, "{{navbox")).toBe(
      `{{navbox
| list1 = {{navbox subgroup
  | group1 = Alpha
  }}
| below = text
}}`,
    );
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

    expect(expectStableTemplateFormatting(source, "{{navbox")).toBe(
      `{{navbox
| list1 =
  {{navbox subgroup
  | list1 =
    {{navbox subgroup
    | group1 = Alpha
    }}
  }}
}}`,
    );
  });

  it("pulls a single-line value up to its parameter", () => {
    expect(
      expectStableTemplateFormatting(
        "{{navbox\n| list1 =\n\n[[A]]{{·}}[[B]]\n}}",
        "{{navbox",
      ),
    ).toBe("{{navbox\n| list1 = [[A]]{{·}}[[B]]\n}}");
  });

  it("keeps a consistent deeper indentation of template code", () => {
    const source = `{{#if: x
  | {{#ifeq: y | z
    | {{{all|}}}{{handler/numbered
      |1={{{1|}}}
      | data =
        <!--Return the data.  -->
        {{namespace detect
        |main={{{main|}}}
        }}
      }}
    }}
}}`;

    expect(expectStableTemplateFormatting(source, "{{handler/numbered")).toBe(
      `{{#if: x
  | {{#ifeq: y | z
    | {{{all|}}}{{handler/numbered
      | 1 = {{{1|}}}
      | data =
        <!--Return the data.  -->
        {{namespace detect
        | main = {{{main|}}}
        }}
      }}
    }}
}}`,
    );
  });

  it("does not keep inconsistent template code indentation", () => {
    const source = `{{#if: x |
{{Infobox
|a=1
    }}
}}`;

    expect(expectStableTemplateFormatting(source, "{{Infobox")).toBe(
      `{{#if: x |
{{Infobox
| a = 1
}}
}}`,
    );
  });

  it("does not indent a template that follows other content in a value", () => {
    const source = `{{Hide
| title = More
| content =
* First
{{Dialog
|title=Hi
|no=Wait
}}
* Second
}}`;

    expect(expectStableTemplateFormatting(source, "{{Hide")).toBe(
      `{{Hide
| title = More
| content =
* First
{{Dialog
| title = Hi
| no = Wait
}}
* Second
}}`,
    );
  });

  it("keeps parameters that share a line compact beside anonymous ones", () => {
    const source = `{{List|anon
|a=1|b=2
<!-- c -->|c=
Text

More
|d=4
}}`;

    expect(expectStableTemplateFormatting(source, "{{List")).toBe(
      `{{List|anon
|a=1|b=2
<!-- c -->|c=
Text

More
| d = 4
}}`,
    );
  });

  it("does not indent templates nested only in parser functions", () => {
    const source = `{{#if: x |
{{Infobox
|a=1
}}
}}`;

    expect(expectStableTemplateFormatting(source, "{{Infobox")).toBe(
      `{{#if: x |
{{Infobox
| a = 1
}}
}}`,
    );
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
      stableLength: 2391,
    },
    {
      revid: 18232,
      fixture: "revid-18232-story-nav-mobile.wiki",
      stableLength: 3069,
    },
    {
      revid: 17041,
      fixture: "revid-17041-pack-nav.wiki",
      stableLength: 3954,
    },
  ])(
    "formats revid=$revid to a structurally equivalent fixed point",
    async ({ fixture, stableLength }) => {
      // MediaWiki stored these revisions without a final line break. Repository
      // text fixtures conventionally include one, so remove only that fixture byte.
      const source = (await readRealPage(fixture)).replace(/\n$/u, "");
      const formatted = expectStableTemplateFormatting(
        source,
        "{{navbox subgroup\n",
      );

      expect(formatted).toHaveLength(stableLength);
      expect(formatted).toMatch(/^ *\| list1 +=\n +\{\{navbox subgroup$/mu);
      expect(formatted).not.toMatch(/=[ \t]+\n/u);
    },
    HISTORICAL_FIXTURE_TIMEOUT_MS,
  );
});

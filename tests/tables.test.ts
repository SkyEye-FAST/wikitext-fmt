import { describe, expect, it } from "vitest";

import {
  tableStructuralFingerprint,
  verifyStructuralEquivalence,
} from "../src/equivalence.js";
import {
  type FormatOptions,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import { resolveOptions } from "../src/options.js";
import {
  createNodeParserSession,
  getParserConfig,
  parseWikitext,
} from "../src/parser.js";
import { formatTablesWithDiagnostics } from "../src/rules/tables.js";

const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);
const production: FormatOptions = { profile: "production" };

function expectProductionTable(
  input: string,
  options: FormatOptions = production,
): ReturnType<typeof formatWikitextSafeDetailed> {
  expect(() => parseWikitext(input, config)).not.toThrow();
  const once = formatWikitextSafeDetailed(input, options);
  expect(once.warning).toBeUndefined();
  expect(once.formatted).not.toBe(input);
  expect(() => parseWikitext(once.formatted, config)).not.toThrow();
  expect(tableStructuralFingerprint(once.formatted, config)).toBe(
    tableStructuralFingerprint(input, config),
  );
  expect(
    verifyStructuralEquivalence(input, once.formatted, config, "tables"),
  ).toEqual({ equivalent: true, structure: "tables" });
  expect(
    once.equivalenceDiagnostics.find((item) => item.structure === "tables"),
  ).toEqual({ equivalent: true, structure: "tables" });
  const twice = formatWikitextSafeDetailed(once.formatted, options);
  expect(twice.warning).toBeUndefined();
  expect(twice.formatted).toBe(once.formatted);
  return once;
}

function expectProductionTableOutput(
  input: string,
  expected: string,
  options: FormatOptions = production,
): ReturnType<typeof formatWikitextSafeDetailed> {
  expect(() => parseWikitext(input, config)).not.toThrow();
  const once = formatWikitextSafeDetailed(input, options);
  expect(once.warning).toBeUndefined();
  expect(once.formatted).toBe(expected);
  expect(() => parseWikitext(once.formatted, config)).not.toThrow();
  expect(tableStructuralFingerprint(once.formatted, config)).toBe(
    tableStructuralFingerprint(input, config),
  );
  const twice = formatWikitextSafeDetailed(once.formatted, options);
  expect(twice.warning).toBeUndefined();
  expect(twice.formatted).toBe(expected);
  return once;
}

describe("production parser table formatter", () => {
  it.each([
    ["simple two-column data row", "{|\n| A || B\n|}"],
    ["many-column row", "{|\n! A !! B !! C !! D\n|}"],
    ["mixed header and data cells", "{|\n! A !! B\n|-\n| C || D\n|}"],
    [
      "table, row, and cell attributes",
      '{| class="wikitable"\n|- class="row"\n| colspan="2" rowspan="3" | A || B\n|}',
    ],
    ["caption", "{|\n|+ Representative caption\n! A !! B\n|}"],
    ["comments", "{|\n<!--keep-->\n| A || B\n|}"],
    [
      "apostrophes in ordinary cell content",
      "{|\n| [[Viyella's Tears]] || [[Dreamin' Attraction!!]] || C\n|}",
    ],
    [
      "quoted cell attributes containing separators",
      '{|\n| data-note="A || B" | C || D\n|}',
    ],
    ["single brackets inside wikilink labels", "{|\n| [[［X］|[X]]] || C\n|}"],
    ["continuation lines", "{|\n| first\ncontinued text\n|-\n| A || B\n|}"],
    ["empty cells", "{|\n| A || || C\n|}"],
    ["HTML", "{|\n| <span class=x>A</span> || B\n|}"],
    ["preformatted content", "{|\n| <pre>  A  </pre> || B\n|}"],
    ["references", "{|\n| <ref name=x>citation || opaque</ref> || B\n|}"],
    ["comment inside a cell", "{|\n| A<!-- keep --> || B\n|}"],
    ["template", "{|\n| {{Cell|name=A|value=B}} || C\n|}"],
    ["anonymous template value", "{|\n| {{T| foo }} || C\n|}"],
    ["parser function", "{|\n| {{#if:x|yes|no}} || C\n|}"],
    ["wikilink containing separators", "{|\n| [[Page|A || B]] || C\n|}"],
    [
      "external link containing separators",
      "{|\n| [https://example.test A || B] || C\n|}",
    ],
    ["multiple independent tables", "{|\n| A || B\n|}\n\n{|\n! C !! D\n|}"],
  ])("formats %s through the safe production path", (_name, input) => {
    expectProductionTable(`${input}\n`);
  });

  it("adds canonical spacing to standalone data cells", () => {
    const result = expectProductionTable("{|\n|-\n|A\n|B\n|}\n");
    expect(result.formatted).toBe("{|\n|-\n| A\n| B\n|}\n");
  });

  it("adds canonical spacing to standalone header cells", () => {
    const result = expectProductionTable("{|\n|-\n!A\n!B\n|}\n");
    expect(result.formatted).toBe("{|\n|-\n! A\n! B\n|}\n");
  });

  it("does not add trailing whitespace to empty cells", () => {
    const input = "{|\n|-\n|\n!\n|}\n";
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
    expect(result.formatted).not.toMatch(/[ \t]+$/mu);
  });

  it("removes an existing lone layout space from empty cells", () => {
    const result = expectProductionTable("{|\n|-\n| \n! \n|}\n");
    expect(result.formatted).toBe("{|\n|-\n|\n!\n|}\n");
    expect(result.formatted).not.toMatch(/[ \t]+$/mu);
  });

  it("normalizes cell attribute boundary spacing without changing attributes", () => {
    const result = expectProductionTable(
      '{|\n|-\n|style="text-align:center"|A\n!scope="col"|B\n|}\n',
    );
    expect(result.formatted).toBe(
      '{|\n|-\n| style="text-align:center" | A\n! scope="col" | B\n|}\n',
    );
  });

  it.each([
    [
      "plain caption",
      "{|\n|+Caption\n| A\n|}\n",
      "{|\n|+ Caption\n| A\n|}\n",
    ],
    [
      "already canonical caption",
      "{|\n|+ Caption\n| A\n|}\n",
      "{|\n|+ Caption\n| A\n|}\n",
    ],
    ["empty caption", "{|\n|+\n| A\n|}\n", "{|\n|+\n| A\n|}\n"],
    [
      "lone layout space in an empty caption",
      "{|\n|+ \n| A\n|}\n",
      "{|\n|+\n| A\n|}\n",
    ],
    [
      "caption attributes and content delimiter",
      '{|\n|+style="text-align:center"|Caption\n| A\n|}\n',
      '{|\n|+ style="text-align:center" | Caption\n| A\n|}\n',
    ],
    [
      "caption link content",
      "{|\n|+ class=\"caption\" | [[Page|Caption]]\n| A\n|}\n",
      "{|\n|+ class=\"caption\" | [[Page|Caption]]\n| A\n|}\n",
    ],
    [
      "caption template content",
      "{|\n|+{{Caption|x=1}}\n| A\n|}\n",
      "{|\n|+ {{Caption|x=1}}\n| A\n|}\n",
    ],
    [
      "caption comment content",
      "{|\n|+<!--keep-->Caption\n| A\n|}\n",
      "{|\n|+ <!--keep-->Caption\n| A\n|}\n",
    ],
    [
      "multiline caption content",
      "{|\n|+Caption\ncontinued\n| A\n|}\n",
      "{|\n|+ Caption\ncontinued\n| A\n|}\n",
    ],
    [
      "tab-bearing caption content",
      "{|\n|+\tCaption\n| A\n|}\n",
      "{|\n|+ \tCaption\n| A\n|}\n",
    ],
    [
      "additional ASCII caption whitespace",
      "{|\n|+  Caption\n| A\n|}\n",
      "{|\n|+  Caption\n| A\n|}\n",
    ],
    [
      "non-breaking space caption content",
      "{|\n|+\u00a0Caption\n| A\n|}\n",
      "{|\n|+ \u00a0Caption\n| A\n|}\n",
    ],
    [
      "narrow no-break space caption content",
      "{|\n|+\u202fCaption\n| A\n|}\n",
      "{|\n|+ \u202fCaption\n| A\n|}\n",
    ],
    [
      "ideographic-space caption content",
      "{|\n|+\u3000Caption\n| A\n|}\n",
      "{|\n|+ \u3000Caption\n| A\n|}\n",
    ],
  ])("normalizes %s", (_name, input, expected) => {
    expectProductionTableOutput(input, expected);
  });

  it("normalizes table opener and explicit-row attribute prefixes", () => {
    const result = expectProductionTableOutput(
      '{|class="wikitable"\n|-class="row"\n| A\n|}\n',
      '{| class="wikitable"\n|- class="row"\n| A\n|}\n',
    );
    expect(result.tableDiagnostics).toContainEqual(
      expect.objectContaining({
        changed: true,
        lineDiagnostics: expect.arrayContaining([
          expect.objectContaining({
            tableLine: 1,
            reason: "normalized table opener attribute layout",
          }),
          expect.objectContaining({
            tableLine: 2,
            reason: "normalized table row attribute layout",
          }),
        ]),
      }),
    );
  });

  it("adds canonical spacing while splitting inline cells", () => {
    const result = expectProductionTable("{|\n|-\n|A||B\n!C!!D\n|}\n");
    expect(result.formatted).toBe(
      "{|\n|-\n| A\n| B\n! C\n! D\n|}\n",
    );
    expect(result.formatted).not.toMatch(/[ \t]+$/mu);
  });

  it("composes cell layout and separator replacements at their shared boundary", () => {
    const result = expectProductionTable(
      '{|\n|-\n|style="text-align:center"|A||B\n|}\n',
    );
    expect(result.formatted).toBe(
      '{|\n|-\n| style="text-align:center" | A\n| B\n|}\n',
    );
  });

  it("leaves canonical standalone cell spacing unchanged", () => {
    const input = "{|\n|-\n| A\n! B\n|}\n";
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
  });

  it("keeps additional leading cell whitespace structurally significant", () => {
    const compact = "{|\n|A\n|}\n";
    const canonical = "{|\n| A\n|}\n";
    const intentional = "{|\n|  A\n|}\n";
    expect(tableStructuralFingerprint(compact, config)).toBe(
      tableStructuralFingerprint(canonical, config),
    );
    expect(tableStructuralFingerprint(canonical, config)).not.toBe(
      tableStructuralFingerprint(intentional, config),
    );
  });

  it.each([
    ["wikilink", "[[Page|label]]"],
    ["template", "{{T|value}}"],
    ["parser function", "{{#if:x|yes|no}}"],
    ["comment", "<!--keep-->value"],
    ["HTML", "<span>value</span>"],
    ["multiline content", "first\ncontinued"],
  ])("formats safe standalone %s cell content", (_name, content) => {
    const result = expectProductionTable(`{|\n|${content}\n|}\n`);
    expect(result.formatted).toBe(`{|\n| ${content}\n|}\n`);
  });

  it("preserves an outer cell containing a nested table", () => {
    const input = "{|\n|\n{|\n| A\n|}\n|}\n";
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
  });

  it("leaves an outer caption containing a nested table untouched", () => {
    const result = expectProductionTable(
      "{|\n|+\n{|\n|+Caption\n|}\n|}\n",
    );
    expect(result.formatted).toBe("{|\n|+\n{|\n|+ Caption\n|}\n|}\n");
  });

  it("preserves intentional leading whitespace after the layout space", () => {
    const input = "{|\n|  intentional\n|}\n";
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
  });

  it("formats nested tables deepest-first", () => {
    const result = expectProductionTable(
      "{|\n| outer\n{|\n| A || B\n|}\n| tail || end\n|}\n",
    );
    expect(result.tableFormatDiagnostics).toMatchObject({
      tablesInspected: 2,
      tablesEligible: 2,
      tablesChanged: 2,
      tablesSkippedAmbiguous: 0,
    });
    expect(new Set(result.tableFormatDiagnostics.tableSemanticIds).size).toBe(
      2,
    );
    expect(
      new Set(result.tableFormatDiagnostics.changedTableSemanticIds),
    ).toEqual(new Set(result.tableFormatDiagnostics.tableSemanticIds));
    expect(
      result.tableDiagnostics.every(
        (diagnostic) =>
          diagnostic.semanticId !== undefined &&
          result.tableFormatDiagnostics.tableSemanticIds.includes(
            diagnostic.semanticId,
          ),
      ),
    ).toBe(true);
    expect(result.tableFormatDiagnostics.formattingPassesUsed).toBeGreaterThan(
      1,
    );
  });

  it("formats multiple nested table levels", () => {
    expectProductionTable(
      "{|\n| level one\n{|\n| level two\n{|\n! A !! B\n|}\n| C || D\n|}\n| E || F\n|}\n",
    );
  });

  it("formats a table inside a template parameter", () => {
    expectProductionTable(
      "{{Panel\n| title = Results\n| content =\n{|\n! A !! B\n|-\n| C || D\n|}\n}}\n",
    );
  });

  it("formats templates inside table cells", () => {
    const result = expectProductionTable(
      "{|\n| {{Cell|name=A|nested={{Inner|x=1|y=2}}}} || B\n|}\n",
    );
    expect(result.formatted).toContain(
      "{{Inner\n| x = 1\n| y = 2\n}}",
    );
  });

  it("formats a nested table inside a template", () => {
    expectProductionTable(
      "{{Panel\n| content =\n{|\n| outer\n{|\n| A || B\n|}\n| C || D\n|}\n}}\n",
    );
  });

  it("uses the documented fallback when parser and link-aware separators disagree", () => {
    const result = expectProductionTable("{|\n| [[Page|A || B]] || C\n|}\n");
    expect(result.tableDiagnostics).toContainEqual(
      expect.objectContaining({
        changed: true,
        ambiguous: false,
        reason: expect.stringContaining(
          "parser cell tokenization disagreed with balanced link-aware separators; used documented top-level fallback",
        ),
      }),
    );
  });

  it("reports an ambiguous disagreement when the fallback cannot balance it", () => {
    const input = "{|\n| [[A || B\n|}";
    const result = formatTablesWithDiagnostics(
      session.createContext(input),
      resolveOptions({ profile: "production" }),
    );
    expect(result.formatted).toBe(input);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        changed: false,
        ambiguous: true,
        reason:
          "parser cell tokenization disagreed and the balanced top-level separator fallback could not establish boundaries",
      }),
    );
    expect(result.summary).toMatchObject({
      tablesInspected: 1,
      tablesEligible: 0,
      tablesChanged: 0,
      tablesAlreadyCanonical: 0,
      tablesSkippedAmbiguous: 1,
    });
  });

  it("preserves inline separators while normalizing other table layout", () => {
    const input = '{|class="wikitable"\n|-class="row"\n|+Caption\n|A||B\n|}\n';
    const result = expectProductionTableOutput(input, '{| class="wikitable"\n|- class="row"\n|+ Caption\n| A||B\n|}\n', {
      profile: "production",
      tableCellSeparatorStyle: "preserve",
    });
    expect(result.formatted).toContain("| A||B");
    expect(result.tableFormatDiagnostics).toMatchObject({
      tablesInspected: 1,
      tablesEligible: 1,
      tablesChanged: 1,
      tablesAlreadyCanonical: 0,
      tablesSkippedAmbiguous: 0,
    });
    expect(result.tableDiagnostics).toContainEqual(
      expect.objectContaining({
        separatorStyle: "preserve",
        separatorStyleReason: "explicit preserve option",
        reason: expect.stringContaining("normalized table caption layout"),
      }),
    );
  });

  it("removes only separator-adjacent layout whitespace while splitting", () => {
    const input = "{|\n|  A  ||  B  \n|}\n";
    const result = expectProductionTable(input);
    expect(result.formatted).toBe("{|\n|  A \n|  B  \n|}\n");
  });

  it("keeps inline separators when a split would create row syntax", () => {
    const input = "{|\n|1||--||--\n|-\n|2||50||50\n|}\n";
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(
      "{|\n| 1||--||--\n|-\n| 2\n| 50\n| 50\n|}\n",
    );
    expect(tableStructuralFingerprint(result.formatted, config)).toBe(
      tableStructuralFingerprint(input, config),
    );
  });

  it("uses the exact parser context source snapshot", () => {
    const source = "{|\n| A || B\n|}\n";
    const options = resolveOptions({
      profile: "production",
      tableCellSeparatorStyle: "split",
    });
    const context = session.createContext(source);
    expect(formatTablesWithDiagnostics(context, options)).toEqual(
      formatTablesWithDiagnostics(session.createContext(source), options),
    );
  });

  it("requires callers to recreate context after source changes", () => {
    const source = "{|\n| A || B\n|}\n";
    const staleContext = session.createContext("Plain text\n");
    expect(staleContext.source).not.toBe(source);
    const result = formatTablesWithDiagnostics(
      session.createContext(source),
      resolveOptions({ profile: "production" }),
    );
    expect(result.formatted).toBe("{|\n| A\n| B\n|}\n");
  });

  it("maps production diagnostics across protected blocks", () => {
    const source = "<nowiki>\nraw\n</nowiki>\nLead\n{|\n| A || B\n|}\n";
    const result = formatWikitextDetailedResult(source, production);
    expect(result.tableDiagnostics).toEqual([
      expect.objectContaining({
        start: source.indexOf("{|"),
        line: 5,
        changed: true,
        ambiguous: false,
      }),
    ]);
  });

  it("does not collect diagnostics when disabled", () => {
    const result = formatWikitextDetailedResult("{|\n! A !! B\n|}\n", {
      formatTables: false,
    });
    expect(result.tableDiagnostics).toEqual([]);
    expect(result.tableFormatDiagnostics.tablesInspected).toBe(0);
  });
});

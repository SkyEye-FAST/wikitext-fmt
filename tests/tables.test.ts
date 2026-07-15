import { describe, expect, it } from "vitest";
import {
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
  type FormatOptions,
} from "../src/index.js";
import {
  tableStructuralFingerprint,
  verifyStructuralEquivalence,
} from "../src/equivalence.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import { resolveOptions } from "../src/options.js";
import { formatTablesWithDiagnostics } from "../src/rules/tables.js";

const config = getParserConfig("mediawiki");
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
    expect(result.tableFormatDiagnostics.formattingPassesUsed).toBeGreaterThan(1);
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
    expect(result.formatted).toContain("{{Inner\n| x = 1\n| y = 2\n}}");
  });

  it("formats a nested table inside a template", () => {
    expectProductionTable(
      "{{Panel\n| content =\n{|\n| outer\n{|\n| A || B\n|}\n| C || D\n|}\n}}\n",
    );
  });

  it("uses the documented fallback when parser and link-aware separators disagree", () => {
    const result = expectProductionTable(
      "{|\n| [[Page|A || B]] || C\n|}\n",
    );
    expect(result.tableDiagnostics).toContainEqual(
      expect.objectContaining({
        changed: true,
        ambiguous: false,
        reason:
          "parser cell tokenization disagreed with balanced link-aware separators; used documented top-level fallback",
      }),
    );
  });

  it("reports an ambiguous disagreement when the fallback cannot balance it", () => {
    const input = "{|\n| [[A || B\n|}";
    const result = formatTablesWithDiagnostics(
      input,
      config,
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
      tablesEligible: 1,
      tablesChanged: 0,
      tablesAlreadyCanonical: 0,
      tablesSkippedAmbiguous: 1,
    });
  });

  it("preserves inline separators when explicitly requested", () => {
    const input = "{|\n! A !! B\n|-\n| C || D\n|}\n";
    const result = formatWikitextSafeDetailed(input, {
      profile: "production",
      tableCellSeparatorStyle: "preserve",
    });
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
    expect(result.tableFormatDiagnostics).toMatchObject({
      tablesInspected: 1,
      tablesEligible: 1,
      tablesChanged: 0,
      tablesAlreadyCanonical: 1,
      tablesSkippedAmbiguous: 0,
    });
  });

  it("preserves cell whitespace while replacing only separator syntax", () => {
    const input = "{|\n|  A  ||  B  \n|}\n";
    const result = expectProductionTable(input);
    expect(result.formatted).toContain("|  A  \n|  B  ");
  });

  it("produces identical output with an explicit current parser context", () => {
    const source = "{|\n| A || B\n|}\n";
    const options = resolveOptions({
      profile: "production",
      tableCellSeparatorStyle: "split",
    });
    expect(
      formatTablesWithDiagnostics(
        source,
        config,
        options,
        createParserContext(source, config),
      ),
    ).toEqual(formatTablesWithDiagnostics(source, config, options));
  });

  it("ignores a stale parser context", () => {
    const source = "{|\n| A || B\n|}\n";
    const result = formatTablesWithDiagnostics(
      source,
      config,
      resolveOptions({ profile: "production" }),
      createParserContext("Plain text\n", config),
    );
    expect(result.formatted).toBe("{|\n| A \n| B\n|}\n");
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

import { describe, expect, it } from "vitest";
import { formatWikitextDetailedResult } from "../src/formatter.js";
import { getParserConfig } from "../src/parser.js";
import { resolveOptions } from "../src/options.js";
import {
  analyzeCellAttributesForTesting,
  analyzeSimpleTableForTesting,
  formatTablesWithDiagnostics,
} from "../src/rules/tables.js";

describe("experimental table analysis diagnostics", () => {
  it.each([
    [
      "protected placeholder",
      "{|\n| \uE000wikitext-fmt:0:\uE001\n|}",
      /placeholder/u,
    ],
    ["template", "{|\n| {{N\/a}}\n|}", /template/u],
    ["HTML tag", "{|\n| <span>value<\/span>\n|}", /HTML|tag/u],
    ["nested table", "{|\n|\n{|\n| nested\n|}\n|}", /nested/u],
    ["unbalanced table", "{|\n| value", /unbalanced/u],
    [
      "quoted separator",
      '{|\n| style="A || B" | C || D\n|}',
      /unsafe separator in quoted cell attributes/u,
    ],
    [
      "unbalanced wikilink",
      "{|\n| [[A || B\n|}",
      /uncertain cell attribute prefix|unsafe data cell separator/u,
    ],
    ["unclear line", "{|\nplain text\n|}", /unclear table line type/u],
  ])("reports %s", (_name, raw, reason) => {
    const result = analyzeSimpleTableForTesting(raw);
    expect(result.changed).toBe(false);
    if (!result.changed) expect(result.reason).toMatch(reason);
  });

  it.each([
    [
      "simple compact inline table",
      "{|\n! Name !! Value\n|-\n| [[Alpha]] || 1\n|}",
      120,
      "preserve",
      "simple compact inline table",
    ],
    [
      "many columns",
      "{|\n! A !! B !! C !! D\n|}",
      120,
      "split",
      "many columns",
    ],
    [
      "cell attributes",
      '{|\n| style="text-align:center" | A || B\n|}',
      120,
      "split",
      "cell attributes",
    ],
    [
      "line width",
      "{|\n| Alpha || Beta\n|}",
      10,
      "split",
      "line exceeds lineWidth",
    ],
    ["mostly split", "{|\n! A\n! B\n|}", 120, "split", "already mostly split"],
    [
      "mixed style",
      "{|\n! A\n! B\n|-\n| 1 || 2\n|}",
      120,
      "split",
      "mixed inline and split style",
    ],
    [
      "unsafe row",
      "{|\n! A !! B\n|-\n| {{N/a}} || 1\n|}",
      120,
      "split",
      "contains skipped unsafe rows",
    ],
    [
      "many rows",
      [
        "{|",
        ...Array.from({ length: 12 }, (_, index) => `| ${index} || value`),
        "|}",
      ].join("\n"),
      120,
      "split",
      "many table rows",
    ],
  ] as const)(
    "selects a style for %s",
    (_name, raw, lineWidth, style, reason) => {
      expect(
        analyzeSimpleTableForTesting(raw, {
          lineWidth,
          tableCellSeparatorStyle: "auto",
        }),
      ).toMatchObject({ separatorStyle: style, separatorStyleReason: reason });
    },
  );

  it.each([
    ["preserve", "explicit preserve option"],
    ["split", "explicit split option"],
  ] as const)("reports the explicit %s override", (style, reason) => {
    expect(
      analyzeSimpleTableForTesting("{|\n! A !! B !! C !! D\n|}", {
        lineWidth: 120,
        tableCellSeparatorStyle: style,
      }),
    ).toMatchObject({ separatorStyle: style, separatorStyleReason: reason });
  });

  it("reports changed output for a supported split table", () => {
    expect(
      analyzeSimpleTableForTesting("{|\n! A !! B\n|}", {
        lineWidth: 120,
        tableCellSeparatorStyle: "split",
      }),
    ).toMatchObject({ changed: true, value: "{|\n! A\n! B\n|}" });
  });

  it.each([
    ["simple data row", "{|\n| A || B\n|}", "{|\n| A\n| B\n|}"],
    [
      "data row with wikilink",
      "{|\n| [[A|Display]] || B\n|}",
      "{|\n| [[A|Display]]\n| B\n|}",
    ],
    [
      "data row with external link",
      "{|\n| [https://example.com Example] || B\n|}",
      "{|\n| [https://example.com Example]\n| B\n|}",
    ],
    [
      "data row with simple attributes",
      '{|\n| class="x" | A || B\n|}',
      '{|\n| class="x" | A\n| B\n|}',
    ],
    [
      "data row with multiple attributes",
      '{|\n| colspan="2" rowspan="3" | A || B\n|}',
      '{|\n| colspan="2" rowspan="3" | A\n| B\n|}',
    ],
  ])("splits %s in explicit split mode", (_name, raw, value) => {
    expect(
      analyzeSimpleTableForTesting(raw, {
        lineWidth: 120,
        tableCellSeparatorStyle: "split",
      }),
    ).toMatchObject({ changed: true, value });
  });

  it("auto splits safe header and data rows in a mixed table", () => {
    expect(
      analyzeSimpleTableForTesting("{|\n! A\n! B\n|-\n| C || D\n|}", {
        lineWidth: 120,
        tableCellSeparatorStyle: "auto",
      }),
    ).toMatchObject({
      changed: true,
      value: "{|\n! A\n! B\n|-\n| C\n| D\n|}",
      separatorStyle: "split",
      separatorStyleReason: "mixed inline and split style",
    });
  });

  it("auto preserves a small compact inline table", () => {
    expect(
      analyzeSimpleTableForTesting(
        "{|\n! Name !! Value\n|-\n| [[Alpha]] || 1\n|}",
        {
          lineWidth: 120,
          tableCellSeparatorStyle: "auto",
        },
      ),
    ).toMatchObject({
      changed: false,
      separatorStyle: "preserve",
      separatorStyleReason: "simple compact inline table",
    });
  });

  it("explicit preserve keeps inline separators even for complex inline rows", () => {
    expect(
      analyzeSimpleTableForTesting("{|\n! A !! B !! C !! D\n|}", {
        lineWidth: 120,
        tableCellSeparatorStyle: "preserve",
      }),
    ).toMatchObject({
      changed: false,
      separatorStyle: "preserve",
      separatorStyleReason: "explicit preserve option",
    });
  });

  it("reports 1-based table line numbers", () => {
    const source = 'Lead\n\n{| class="wikitable"\n! A !! B\n|}\n';
    const result = formatTablesWithDiagnostics(
      source,
      getParserConfig("mediawiki"),
      resolveOptions({
        level: "experimental",
        formatTables: true,
        tableCellSeparatorStyle: "split",
      }),
    );
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ start: 6, line: 3, changed: true }),
    ]);
  });

  it("maps diagnostics across protected blocks", () => {
    const source = "<nowiki>\nraw\n</nowiki>\nLead\n{|\n| A || B\n|}\n";
    const result = formatWikitextDetailedResult(source, {
      level: "experimental",
      formatTables: true,
      tableCellSeparatorStyle: "split",
    });
    expect(result.tableDiagnostics).toEqual([
      expect.objectContaining({
        start: source.indexOf("{|"),
        line: 5,
        changed: true,
      }),
    ]);
  });

  it("does not collect diagnostics when the rule is disabled", () => {
    expect(
      formatWikitextDetailedResult("{|\n! A !! B\n|}\n", {
        level: "normal",
        formatTables: true,
      }).tableDiagnostics,
    ).toEqual([]);
  });

  it("auto can split safe rows while preserving unsafe rows", () => {
    const result = formatWikitextDetailedResult(
      "{|\n! A !! B\n|-\n| {{N/a}} || 1\n|-\n| C || D\n|}\n",
      {
        level: "experimental",
        formatTables: true,
        tableCellSeparatorStyle: "auto",
      },
    );
    expect(result.formatted).toContain("! A\n! B");
    expect(result.formatted).toContain("| {{N/a}} || 1");
    expect(result.formatted).toContain("| C\n| D");
    expect(result.tableDiagnostics).toEqual([
      expect.objectContaining({
        changed: true,
        reason: "formatted with skipped unsafe lines",
        separatorStyle: "split",
        separatorStyleReason: "contains skipped unsafe rows",
      }),
    ]);
  });

  it("explicit split still formats safe rows while preserving unsafe rows", () => {
    const result = formatWikitextDetailedResult(
      "{|\n! A !! B\n|-\n| {{N/a}} || 1\n|-\n| C || D\n|}\n",
      {
        level: "experimental",
        formatTables: true,
        tableCellSeparatorStyle: "split",
      },
    );
    expect(result.formatted).toContain("! A\n! B");
    expect(result.formatted).toContain("| {{N/a}} || 1");
    expect(result.formatted).toContain("| C\n| D");
    expect(result.tableDiagnostics).toEqual([
      expect.objectContaining({
        changed: true,
        reason: "formatted with skipped unsafe lines",
        separatorStyle: "split",
        separatorStyleReason: "explicit split option",
      }),
    ]);
  });

  it("detects auto style independently for each table", () => {
    const source = [
      "{|",
      "! A !! B",
      "|-",
      "| 1 || 2",
      "|}",
      "{|",
      "! A !! B !! C !! D",
      "|-",
      "| 1 || 2 || 3 || 4",
      "|}",
      "",
    ].join("\n");
    const result = formatWikitextDetailedResult(source, {
      level: "experimental",
      formatTables: true,
      tableCellSeparatorStyle: "auto",
    });
    expect(
      result.tableDiagnostics.map(({ separatorStyle }) => separatorStyle),
    ).toEqual(["preserve", "split"]);
  });

  it.each([
    ["single style", ' style="text-align:center" | A || B', "||", true, false],
    [
      "colspan and rowspan",
      ' colspan="2" rowspan="3" | A || B',
      "||",
      true,
      false,
    ],
    [
      "header scope and class",
      ' scope="col" class="unsortable" | Name !! Value',
      "!!",
      true,
      false,
    ],
    ["quoted unsafe separator", ' data-x="A || B" | C || D', "||", true, true],
    ["no attributes", " [[A|Display]] || B", "||", false, false],
  ] as const)(
    "analyzes %s cell attributes",
    (_name, content, separator, hasAttributes, hasUnsafeSeparator) => {
      expect(analyzeCellAttributesForTesting(content, separator)).toMatchObject(
        {
          hasAttributes,
          hasUnsafeSeparator,
          isSafe: true,
        },
      );
    },
  );

  it("rejects uncertain cell attribute prefixes", () => {
    expect(
      analyzeCellAttributesForTesting(" uncertain prefix | A || B", "||"),
    ).toMatchObject({
      hasAttributes: false,
      isSafe: false,
    });
  });

  it("auto can split independent safe rows around continuation groups", () => {
    const input = [
      "{|",
      "! Name !! Value",
      "|-",
      "<!-- row comment -->",
      "| Alpha",
      "continued text",
      "|-",
      "| Beta || 2",
      "|}",
    ].join("\n");
    const result = analyzeSimpleTableForTesting(input, {
      lineWidth: 120,
      tableCellSeparatorStyle: "auto",
    });
    expect(result).toMatchObject({
      changed: true,
      value: [
        "{|",
        "! Name",
        "! Value",
        "|-",
        "<!-- row comment -->",
        "| Alpha",
        "continued text",
        "|-",
        "| Beta",
        "| 2",
        "|}",
      ].join("\n"),
      separatorStyle: "split",
      separatorStyleReason: "contains skipped unsafe rows",
    });
  });

  it("explicit split preserves comments and continuation groups while formatting later safe rows", () => {
    const input = [
      "{|",
      "! Name !! Value",
      "|-",
      "<!-- row comment -->",
      "| Alpha",
      "continued text",
      "|-",
      "| Beta || 2",
      "|}",
    ].join("\n");
    const result = analyzeSimpleTableForTesting(input, {
      lineWidth: 120,
      tableCellSeparatorStyle: "split",
    });
    expect(result).toMatchObject({
      changed: true,
      value: [
        "{|",
        "! Name",
        "! Value",
        "|-",
        "<!-- row comment -->",
        "| Alpha",
        "continued text",
        "|-",
        "| Beta",
        "| 2",
        "|}",
      ].join("\n"),
    });
  });
});

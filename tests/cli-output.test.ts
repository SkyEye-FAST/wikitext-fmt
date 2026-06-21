import { describe, expect, it } from "vitest";
import { createUnifiedDiff } from "../src/cli/diff.js";
import { createDiagnosticsRecord, serializeDiagnostics } from "../src/cli/diagnostics.js";
import { createBatchReport } from "../src/cli/report.js";
import { formatWikitextDetailedResult } from "../src/formatter.js";

describe("CLI output helpers", () => {
  it("creates a compact unified diff", () => {
    const diff = createUnifiedDiff(
      "page.wiki",
      "Before\n==Title==\nAfter\n",
      "Before\n== Title ==\nAfter\n",
    );
    expect(diff).toContain("--- page.wiki\n+++ page.wiki\n");
    expect(diff).toContain("@@ -1,4 +1,4 @@");
    expect(diff).toContain("-==Title==\n+== Title ==");
  });

  it("returns no diff for unchanged text", () => {
    expect(createUnifiedDiff("stdin", "same\n", "same\n")).toBe("");
  });

  it("creates separate hunks for distant changes", () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
    const after = [...before];
    after[1] = "changed near start";
    after[17] = "changed near end";
    const diff = createUnifiedDiff("stdin", `${before.join("\n")}\n`, `${after.join("\n")}\n`);
    expect(diff.match(/^@@/gmu)).toHaveLength(2);
    expect(diff).toContain("--- stdin\n+++ stdin\n");
    expect(diff).toContain("-line 2\n+changed near start");
    expect(diff).toContain("-line 18\n+changed near end");
  });

  it("serializes structured table diagnostics", () => {
    const source = "{|\n! A !! B !! C !! D\n|}\n";
    const result = formatWikitextDetailedResult(source, {
      level: "experimental",
      formatTables: true,
      tableCellSeparatorStyle: "auto",
    });
    const diagnostics = JSON.parse(serializeDiagnostics("page.wiki", source, result)) as {
      file: string;
      changed: boolean;
      warning: string | null;
      summary: {
        tables: number;
        formattedTables: number;
        skippedTables: number;
        formattedLines: number;
        skippedUnsafeLines: number;
      };
      tableDiagnostics: Array<{
        line: number;
        separatorStyle: string;
        separatorStyleReason: string;
        lineDiagnostics: unknown[];
      }>;
    };
    expect(diagnostics).toMatchObject({
      file: "page.wiki",
      changed: true,
      warning: null,
      summary: {
        tables: 1,
        formattedTables: 1,
        skippedTables: 0,
        formattedLines: 1,
        skippedUnsafeLines: 0,
      },
    });
    expect(diagnostics.tableDiagnostics[0]).toMatchObject({
      line: 1,
      separatorStyle: "split",
      separatorStyleReason: "many columns",
    });
    expect(diagnostics.tableDiagnostics[0]?.lineDiagnostics.length).toBeGreaterThan(0);
  });

  it("aggregates per-file diagnostics into a batch report", () => {
    const source = "{|\n! A !! B !! C !! D\n|}\n";
    const changed = formatWikitextDetailedResult(source, {
      level: "experimental",
      formatTables: true,
    });
    const unchanged = formatWikitextDetailedResult("plain text\n");
    const report = createBatchReport([
      createDiagnosticsRecord("changed.wiki", source, changed),
      createDiagnosticsRecord("unchanged.wiki", "plain text\n", unchanged),
    ]);

    expect(report.summary).toEqual({
      files: 2,
      changedFiles: 1,
      warningFiles: 0,
      tables: 1,
      formattedTables: 1,
      skippedTables: 0,
      formattedTableLines: 1,
      skippedUnsafeTableLines: 0,
      behaviorSwitchesMoved: 0,
      behaviorSwitchesFormatted: 0,
      defaultsortMoved: 0,
      categoriesMoved: 0,
      localizedCategoryAliasesCanonicalized: 0,
      localizedDefaultsortAliasesCanonicalized: 0,
      localizedBehaviorSwitchesCanonicalized: 0,
    });
    expect(report.files.map((file) => file.file)).toEqual(["changed.wiki", "unchanged.wiki"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  createDiagnosticsRecord,
  serializeDiagnostics,
} from "../src/cli/diagnostics.js";
import { createUnifiedDiff } from "../src/cli/diff.js";
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
    const before = Array.from(
      { length: 20 },
      (_, index) => `line ${index + 1}`,
    );
    const after = [...before];
    after[1] = "changed near start";
    after[17] = "changed near end";
    const diff = createUnifiedDiff(
      "stdin",
      `${before.join("\n")}\n`,
      `${after.join("\n")}\n`,
    );
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
    const diagnostics = JSON.parse(
      serializeDiagnostics("page.wiki", source, result),
    ) as {
      file: string;
      changed: boolean;
      warning: string | null;
      summary: {
        tables: number;
        formattedTables: number;
        skippedTables: number;
        tablesInspected: number;
        tablesEligible: number;
        tablesChanged: number;
        tablesAlreadyCanonical: number;
        tablesSkippedAmbiguous: number;
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
        tablesInspected: 1,
        tablesEligible: 1,
        tablesChanged: 1,
        tablesAlreadyCanonical: 0,
        tablesSkippedAmbiguous: 0,
        formattedLines: 1,
        skippedUnsafeLines: 0,
      },
    });
    expect(diagnostics.tableDiagnostics[0]).toMatchObject({
      line: 1,
      separatorStyle: "split",
      separatorStyleReason:
        "aggressive auto splits every parser-confirmed multi-cell row",
    });
    expect(
      diagnostics.tableDiagnostics[0]?.lineDiagnostics.length,
    ).toBeGreaterThan(0);
  });

  it("serializes list diagnostics and skip reasons", () => {
    const source = ":*item\n:c<!-- c -->\n:\u00A0unchanged\n";
    const result = formatWikitextDetailedResult(source);
    const diagnostics = JSON.parse(
      serializeDiagnostics("lists.wiki", source, result),
    ) as ReturnType<typeof createDiagnosticsRecord>;

    expect(diagnostics.summary).toMatchObject({
      listLinesInspected: 3,
      listLinesEligible: 2,
      listLinesChanged: 2,
      listLinesAlreadyCanonical: 0,
      listLinesSkipped: 1,
      mixedMarkerLinesChanged: 1,
      commentBearingLinesChanged: 1,
      structuredContentLinesChanged: 0,
    });
    expect(diagnostics.listDiagnostics).toEqual({
      listLinesInspected: 3,
      listLinesEligible: 2,
      listLinesChanged: 2,
      listLinesAlreadyCanonical: 0,
      listLinesSkipped: 1,
      mixedMarkerLinesChanged: 1,
      commentBearingLinesChanged: 1,
      structuredContentLinesChanged: 0,
      skipReasons: { "unicode-separator": 1 },
    });
  });

  it("aggregates per-file diagnostics into a batch report", () => {
    const source = "{|\n! A !! B !! C !! D\n|}\n";
    const changed = formatWikitextDetailedResult(source, {
      level: "experimental",
      formatTables: true,
    });
    const listSource = ":*item\n:c<!-- c -->\n";
    const listChanged = formatWikitextDetailedResult(listSource);
    const unchanged = formatWikitextDetailedResult("plain text\n");
    const report = createBatchReport([
      createDiagnosticsRecord("changed.wiki", source, changed),
      createDiagnosticsRecord("lists.wiki", listSource, listChanged),
      createDiagnosticsRecord("unchanged.wiki", "plain text\n", unchanged),
    ]);

    expect(report.summary).toMatchObject({
      files: 3,
      changedFiles: 2,
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
      interlanguageLinksMoved: 0,
      interlanguageLinksFormatted: 0,
      redirectsFormatted: 0,
      localizedRedirectAliasesCanonicalized: 0,
      fileLinksFormatted: 0,
      localizedFileNamespaceAliasesCanonicalized: 0,
      localizedImageOptionsCanonicalized: 0,
      externalLinksFormatted: 0,
      externalLinksSkippedUnsafe: 0,
      referencesFormatted: 0,
      referenceGroupsFormatted: 0,
      referenceLinesSkippedUnsafe: 0,
      listLinesInspected: 2,
      listLinesEligible: 2,
      listLinesChanged: 2,
      listLinesAlreadyCanonical: 0,
      listLinesSkipped: 0,
      mixedMarkerLinesChanged: 1,
      commentBearingLinesChanged: 1,
      structuredContentLinesChanged: 0,
      sectionSpacingBeforeHeadingsInserted: 0,
      sectionSpacingAfterHeadingsInserted: 0,
    });
    expect(report.files.map((file) => file.file)).toEqual([
      "changed.wiki",
      "lists.wiki",
      "unchanged.wiki",
    ]);
  });
});

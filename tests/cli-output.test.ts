import { describe, expect, it } from "vitest";
import { createUnifiedDiff } from "../src/cli/diff.js";
import { serializeDiagnostics } from "../src/cli/diagnostics.js";
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
    });
    expect(diagnostics.tableDiagnostics[0]).toMatchObject({
      line: 1,
      separatorStyle: "split",
      separatorStyleReason: "many columns",
    });
    expect(diagnostics.tableDiagnostics[0]?.lineDiagnostics.length).toBeGreaterThan(0);
  });
});

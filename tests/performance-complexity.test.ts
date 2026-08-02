import { describe, expect, it, vi } from "vitest";

import { createNodeParserSession, getParserConfig } from "../src/parser.js";
import { measureParserContexts } from "../src/parserContext.js";
import {
  type SemanticIdentityStats,
  outermostSourceRanges,
  semanticRangeIdentities,
} from "../src/semanticIdentity.js";
import { formatWikitextSafeDetailed } from "../src/formatter.js";
import { formatListsWithDiagnostics } from "../src/rules/lists.js";
import {
  collectParserTableCandidates,
  type ParserTableCandidateStats,
} from "../src/rules/tables.js";

const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);

function collectWithStats(source: string): {
  candidates: ReturnType<typeof collectParserTableCandidates>;
  stats: ParserTableCandidateStats;
} {
  const stats: ParserTableCandidateStats = {
    openerCount: 0,
    rootCandidates: 0,
    fallbackParses: 0,
    fallbackSourceBytes: 0,
    coveredOpeners: 0,
  };
  const candidates = collectParserTableCandidates(
    session.createContext(source),
    stats,
  );
  return { candidates, stats };
}

describe("parser complexity", () => {
  it("assigns high-cardinality semantic identities with linear containment work", () => {
    const ranges = Array.from({ length: 10_000 }, (_value, index) => ({
      start: index * 4,
      end: index * 4 + 3,
    }));
    const stats: SemanticIdentityStats = {
      rangeCount: 0,
      containmentChecks: 0,
    };
    const identities = semanticRangeIdentities(ranges, "template", stats);
    expect(identities).toHaveLength(ranges.length);
    expect(new Set(identities).size).toBe(ranges.length);
    expect(stats).toEqual({
      rangeCount: ranges.length,
      containmentChecks: ranges.length - 1,
    });
  });

  it("preserves source-order identities for unsorted nested ranges", () => {
    expect(
      semanticRangeIdentities(
        [
          { start: 20, end: 30 },
          { start: 0, end: 40 },
          { start: 5, end: 10 },
          { start: 50, end: 60 },
        ],
        "template",
      ),
    ).toEqual(["template/0/1", "template/0", "template/0/0", "template/1"]);
  });

  it("filters high-cardinality nested ranges with linear containment work", () => {
    const ranges = Array.from({ length: 10_000 }, (_value, index) => ({
      start: index,
      end: 20_000 - index,
    }));
    const stats: SemanticIdentityStats = {
      rangeCount: 0,
      containmentChecks: 0,
    };
    expect(outermostSourceRanges(ranges, stats)).toEqual([ranges[0]]);
    expect(stats).toEqual({
      rangeCount: ranges.length,
      containmentChecks: ranges.length - 1,
    });
  });

  it("bounds parser contexts, source bytes, passes, candidates, and semantic nodes", () => {
    const templateSource = Array.from(
      { length: 10 },
      (_value, index) => `{{T${index}|a=${index}|b={{I|x=${index}}}}}`,
    ).join("\n");
    const templates = measureParserContexts(() =>
      formatWikitextSafeDetailed(templateSource, { profile: "production" }),
    );
    expect(templates.result.failure).toBeUndefined();
    // The production reference/link/section-spacing pass shares one additional
    // current parser snapshot per safe formatting pass.
    expect(templates.metrics.contextsCreated).toBeLessThanOrEqual(26);
    expect(templates.metrics.sourceBytesParsed).toBeLessThanOrEqual(
      templateSource.length * 32,
    );
    expect(
      templates.result.templateDiagnostics.formattingPassesUsed,
    ).toBeLessThanOrEqual(2);
    expect(
      templates.result.templateDiagnostics.templateSemanticIds,
    ).toHaveLength(20);

    const tableSource = Array.from(
      { length: 10 },
      (_value, index) => `{|\n| ${index} || x\n|}`,
    ).join("\n");
    const tables = measureParserContexts(() =>
      formatWikitextSafeDetailed(tableSource, { profile: "production" }),
    );
    const candidates = collectWithStats(tableSource);
    expect(tables.result.failure).toBeUndefined();
    // Production now verifies references on table-protected snapshots and
    // shares current snapshots for external links and section spacing.
    expect(tables.metrics.contextsCreated).toBeLessThanOrEqual(34);
    expect(tables.metrics.sourceBytesParsed).toBeLessThanOrEqual(
      tableSource.length * 38,
    );
    expect(tables.result.tableFormatDiagnostics.formattingPassesUsed).toBeLessThanOrEqual(
      2,
    );
    expect(tables.result.tableFormatDiagnostics.tableSemanticIds).toHaveLength(
      10,
    );
    expect(candidates.candidates).toHaveLength(10);
    expect(candidates.stats).toMatchObject({
      openerCount: 10,
      rootCandidates: 10,
      fallbackParses: 0,
      fallbackSourceBytes: 0,
      coveredOpeners: 10,
    });
  });

  it("avoids parser work when list candidates are absent", () => {
    const source = Array.from(
      { length: 500 },
      (_value, index) => `{{Navbox|name=section ${index}|child={{T|x=${index}}}}}`,
    ).join("\n");
    const measured = measureParserContexts(() =>
      formatListsWithDiagnostics(session.createContext(source)),
    );

    expect(measured.result.formatted).toBe(source);
    expect(measured.result.diagnostics).toEqual({
      listLinesInspected: 0,
      listLinesEligible: 0,
      listLinesChanged: 0,
      listLinesAlreadyCanonical: 0,
      listLinesSkipped: 0,
      mixedMarkerLinesChanged: 0,
      commentBearingLinesChanged: 0,
      structuredContentLinesChanged: 0,
      skipReasons: {},
    });
    expect(measured.metrics).toEqual({
      contextsCreated: 1,
      sourceBytesParsed: source.length,
    });
  });

  it("reuses an existing list parser context and parses candidate sources lazily", () => {
    const canonical = "* item\n";
    const context = session.createContext(canonical);
    const reused = measureParserContexts(() =>
      formatListsWithDiagnostics(context),
    );
    expect(reused.result.formatted).toBe(canonical);
    expect(reused.metrics).toEqual({
      contextsCreated: 0,
      sourceBytesParsed: 0,
    });

    const candidate = "*item\n";
    const created = measureParserContexts(() =>
      formatListsWithDiagnostics(session.createContext(candidate), {
        verifyCandidate: false,
      }),
    );
    expect(created.result.formatted).toBe("* item\n");
    expect(created.metrics).toEqual({
      contextsCreated: 1,
      sourceBytesParsed: candidate.length,
    });
  });

  it("classifies protected-only list candidates without full structural analysis", () => {
    const source = Array.from(
      { length: 100 },
      (_value, index) => `{{T${index}|\n:c\n}}`,
    ).join("\n");
    const measured = measureParserContexts(() =>
      formatListsWithDiagnostics(session.createContext(source)),
    );
    expect(measured.result.formatted).toBe(source);
    expect(measured.result.diagnostics).toMatchObject({
      listLinesInspected: 100,
      listLinesEligible: 0,
      listLinesSkipped: 100,
      skipReasons: { "protected-block": 100 },
    });
    expect(measured.metrics).toEqual({
      contextsCreated: 1,
      sourceBytesParsed: source.length,
    });

    const context = session.createContext(source);
    const querySelectorAll = vi.spyOn(context.root, "querySelectorAll");
    formatListsWithDiagnostics(context);
    expect(querySelectorAll).toHaveBeenCalledWith("list");
    expect(querySelectorAll).toHaveBeenCalledWith("ext");
    expect(querySelectorAll).not.toHaveBeenCalledWith(
      expect.stringContaining("template"),
    );
  });

  it("does not fallback-reparse parser-visible top-level tables", () => {
    const source = Array.from(
      { length: 100 },
      (_value, index) => `{|\n| ${index}\n|}`,
    ).join("\n");
    const { candidates, stats } = collectWithStats(source);
    expect(candidates).toHaveLength(100);
    expect(stats).toMatchObject({
      openerCount: 100,
      rootCandidates: 100,
      fallbackParses: 0,
      coveredOpeners: 100,
    });
  });

  it("uses one bounded fallback parse for many tables in one template", () => {
    const tables = Array.from(
      { length: 100 },
      (_value, index) => `{|\n| ${index}\n|}`,
    ).join("\n");
    const source = `${"prefix\n".repeat(200)}{{Box|content=${tables}|note=value}}${"\nsuffix".repeat(200)}`;
    const { candidates, stats } = collectWithStats(source);
    expect(candidates).toHaveLength(100);
    expect(stats.fallbackParses).toBe(1);
    expect(stats.coveredOpeners).toBe(99);
    expect(stats.fallbackSourceBytes).toBeLessThan(source.length / 2);
  });

  it("confirms a deeply nested table tree with one fallback parse", () => {
    let nested = "leaf";
    for (let depth = 0; depth < 40; depth++) {
      nested = `{|\n| depth ${depth}\n${nested}\n|}`;
    }
    const source = `{{Box|content=${nested}|note=value}}`;
    const { candidates, stats } = collectWithStats(source);
    expect(candidates).toHaveLength(40);
    expect(stats.fallbackParses).toBe(1);
    expect(stats.coveredOpeners).toBe(39);
  });
});

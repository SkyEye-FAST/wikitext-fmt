import { describe, expect, it } from "vitest";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import {
  collectParserTableCandidates,
  type ParserTableCandidateStats,
} from "../src/rules/tables.js";

const config = getParserConfig("mediawiki");

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
    source,
    createParserContext(source, config),
    config,
    stats,
  );
  return { candidates, stats };
}

describe("parser table candidate complexity", () => {
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

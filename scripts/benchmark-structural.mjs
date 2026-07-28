import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { formatWikitextSafeDetailed } from "../dist/index.js";
import { verifyStructuralEquivalence } from "../dist/equivalence.js";
import { getParserConfig } from "../dist/parser.js";
import {
  createParserContext,
  measureParserContexts,
} from "../dist/parserContext.js";
import { collectParserTableCandidates } from "../dist/rules/tables.js";

const config = getParserConfig("mediawiki");

function pageOfSize(targetBytes) {
  const unit = "Representative prose with [[Page|links]] and ordinary text.\n";
  return unit.repeat(Math.ceil(targetBytes / unit.length)).slice(0, targetBytes);
}

function templates(count) {
  return Array.from(
    { length: count },
    (_value, index) =>
      `{{Bench${index}|position ${index}|name=value|nested={{Inner|x=${index}|y=2}}}}\n`,
  ).join("");
}

function tables(count) {
  return Array.from(
    { length: count },
    (_value, index) => `{| class="wikitable"\n! A !! B\n|-\n| ${index} || value\n|}\n`,
  ).join("");
}

function deeplyNestedTemplates(depth) {
  let value = "leaf";
  for (let index = 0; index < depth; index++) {
    value = `{{Depth${index}|value=${value}|position ${index}}}`;
  }
  return `${value}\n`;
}

function deeplyNestedTables(depth) {
  let value = "leaf";
  for (let index = 0; index < depth; index++) {
    value = `{|\n| depth ${index}\n${value}\n|}`;
  }
  return `${value}\n`;
}

function tablesInsideTemplates(count) {
  return `{{Container|content=${tables(count)}|note=value}}\n`;
}

function protectedFalseOpeners(count) {
  return `<nowiki>\n${Array.from(
    { length: count },
    (_value, index) => `literal {| sequence ${index}`,
  ).join("\n")}\n</nowiki>\n`;
}

const cases = [
  ...[10_000, 100_000, 1_000_000].map((size) => ({
    name: `page-${size}-bytes`,
    source: pageOfSize(size),
    templateCount: 0,
    tableCount: 0,
    maximumNestingDepth: 0,
  })),
  ...[10, 100, 500].map((count) => ({
    name: `templates-${count}`,
    source: templates(count),
    templateCount: count * 2,
    tableCount: 0,
    maximumNestingDepth: 2,
  })),
  ...[10, 100, 500].map((count) => ({
    name: `tables-${count}`,
    source: tables(count),
    templateCount: 0,
    tableCount: count,
    maximumNestingDepth: 1,
  })),
  {
    name: "deeply-nested-templates-50",
    source: deeplyNestedTemplates(50),
    templateCount: 50,
    tableCount: 0,
    maximumNestingDepth: 50,
  },
  {
    name: "deeply-nested-tables-50",
    source: deeplyNestedTables(50),
    templateCount: 0,
    tableCount: 50,
    maximumNestingDepth: 50,
  },
  {
    name: "tables-inside-template-100",
    source: tablesInsideTemplates(100),
    templateCount: 1,
    tableCount: 100,
    maximumNestingDepth: 2,
  },
  {
    name: "protected-false-table-openers-500",
    source: protectedFalseOpeners(500),
    templateCount: 0,
    tableCount: 0,
    maximumNestingDepth: 0,
  },
];

function benchmark(entry) {
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const measured = measureParserContexts(() =>
    formatWikitextSafeDetailed(entry.source, { profile: "production" }),
  );
  const totalFormattingMilliseconds = performance.now() - started;
  const result = measured.result;

  const equivalenceStarted = performance.now();
  const templateEquivalence = verifyStructuralEquivalence(
    entry.source,
    result.formatted,
    config,
    "templates",
  );
  const tableEquivalence = verifyStructuralEquivalence(
    entry.source,
    result.formatted,
    config,
    "tables",
  );
  const structuralEquivalenceMilliseconds =
    performance.now() - equivalenceStarted;

  const candidateStats = {
    openerCount: 0,
    rootCandidates: 0,
    fallbackParses: 0,
    fallbackSourceBytes: 0,
    coveredOpeners: 0,
  };
  collectParserTableCandidates(
    entry.source,
    createParserContext(entry.source, config),
    config,
    candidateStats,
  );

  return {
    name: entry.name,
    sourceBytes: Buffer.byteLength(entry.source),
    templateCount: entry.templateCount,
    tableCount: entry.tableCount,
    maximumNestingDepth: entry.maximumNestingDepth,
    parserContextsCreated: measured.metrics.contextsCreated,
    parserContextSourceBytes: measured.metrics.sourceBytesParsed,
    formattingPasses: {
      templates:
        result.templateParameterDiagnostics.formattingPassesUsed,
      tables: result.tableFormatDiagnostics.formattingPassesUsed,
    },
    totalFormattingMilliseconds,
    structuralEquivalenceMilliseconds,
    memory: {
      heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
      processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
    },
    candidateCollection: candidateStats,
    warning: result.warning ?? null,
    equivalent: templateEquivalence.equivalent && tableEquivalence.equivalent,
  };
}

const caseIndex = process.argv.indexOf("--case");
const casePattern = caseIndex >= 0 ? process.argv[caseIndex + 1] : undefined;
if (caseIndex >= 0 && !casePattern) {
  throw new Error("--case requires a substring");
}
const selectedCases = casePattern
  ? cases.filter((entry) => entry.name.includes(casePattern))
  : cases;
if (selectedCases.length === 0) {
  throw new Error(`No benchmark case matched ${JSON.stringify(casePattern)}`);
}
const results = [];
for (const entry of selectedCases) {
  process.stderr.write(`benchmark: ${entry.name}\n`);
  results.push(benchmark(entry));
}
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  cases: results,
};
const json = `${JSON.stringify(report, null, 2)}\n`;
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const output = process.argv[outputIndex + 1];
  if (!output) throw new Error("--output requires a filename");
  await writeFile(output, json, "utf8");
}
process.stdout.write(json);

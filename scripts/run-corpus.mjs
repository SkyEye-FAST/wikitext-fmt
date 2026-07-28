#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import fg from "fast-glob";
import { formatWikitextSafeDetailed } from "../dist/index.js";
import { getParserConfig, parseWikitext } from "../dist/parser.js";

function percentage(numerator, denominator) {
  return denominator === 0
    ? null
    : Number(((numerator / denominator) * 100).toFixed(2));
}

function belowThreshold(actual, minimum) {
  return actual === null ? minimum > 0 : actual < minimum;
}

function threshold(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${option} must be a number from 0 through 100`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    directory: undefined,
    parserConfig: "mediawiki",
    profile: "production",
    output: undefined,
    siteinfo: undefined,
    minTemplateCoverage: 0,
    minTableCoverage: 0,
    allowedSkipReasons: [],
    progress: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--parser-config") options.parserConfig = argv[++index];
    else if (arg === "--profile") options.profile = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--siteinfo") options.siteinfo = argv[++index];
    else if (arg === "--min-template-coverage") {
      options.minTemplateCoverage = threshold(argv[++index], arg);
    } else if (arg === "--min-table-coverage") {
      options.minTableCoverage = threshold(argv[++index], arg);
    } else if (arg === "--allow-skip-reason") {
      options.allowedSkipReasons.push(argv[++index]);
    } else if (arg === "--progress") {
      options.progress = true;
    } else if (arg?.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!options.directory) options.directory = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.directory) {
    throw new Error(
      "Usage: run-corpus.mjs <directory> [--parser-config name-or-path] [--profile production|aggressive] [--siteinfo file] [--output report.json] [--min-template-coverage 0..100] [--min-table-coverage 0..100] [--allow-skip-reason exact-reason]",
    );
  }
  if (options.profile !== "production" && options.profile !== "aggressive") {
    throw new Error("Corpus profile must be production or aggressive");
  }
  if (options.allowedSkipReasons.some((reason) => !reason)) {
    throw new Error("--allow-skip-reason requires a non-empty exact reason");
  }
  return options;
}

function increment(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(
      3,
    ),
  );
}

async function corpusMetadata(directory) {
  try {
    const pages = JSON.parse(
      await readFile(resolve(directory, "metadata/pages.json"), "utf8"),
    );
    return new Map(
      pages.map((page) => [
        resolve(directory, page.sourceFile),
        page,
      ]),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
}

async function localizationOptions(siteinfoPath) {
  if (!siteinfoPath) return {};
  const parsed = JSON.parse(await readFile(resolve(siteinfoPath), "utf8"));
  const aliases = parsed.localizationAliases ?? parsed;
  return { localizationSource: "custom", localizationAliases: aliases };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directory = resolve(args.directory);
  const files = await fg("**/*.wiki", { cwd: directory, absolute: true });
  files.sort();
  const parser = getParserConfig(args.parserConfig);
  const localization = await localizationOptions(args.siteinfo);
  const metadata = await corpusMetadata(directory);
  const pageTimings = [];
  const report = {
    directory,
    parserConfig: args.parserConfig,
    profile: args.profile,
    thresholds: {
      minimumTemplateCoveragePercentage: args.minTemplateCoverage,
      minimumTableCoveragePercentage: args.minTableCoverage,
      allowedSkipReasons: args.allowedSkipReasons,
    },
    pagesProcessed: 0,
    pagesChanged: 0,
    pagesStructurallyCovered: 0,
    pageCoveragePercentage: null,
    totalBytes: 0,
    namespaceDistribution: {},
    warnings: 0,
    parseFailures: 0,
    idempotencyFailures: 0,
    equivalenceFailures: 0,
    convergenceLimitReached: 0,
    templatesInspected: 0,
    templatesEligible: 0,
    templatesChanged: 0,
    templatesFormatted: 0,
    templatesAlreadyCanonical: 0,
    templatesSkippedAmbiguous: 0,
    uniqueTemplatesFormatted: 0,
    templateCoveragePercentage: null,
    tablesInspected: 0,
    tablesEligible: 0,
    tablesChanged: 0,
    tablesFormatted: 0,
    tablesAlreadyCanonical: 0,
    tablesSkippedAmbiguous: 0,
    tableCoveragePercentage: null,
    skipReasons: {},
    unexplainedSkipReasons: {},
    skipDetails: [],
    timingMilliseconds: {
      total: 0,
      p50: null,
      p95: null,
      p99: null,
      maximum: null,
    },
    largestPages: [],
    slowestPages: [],
    failures: [],
  };

  for (const [fileIndex, file] of files.entries()) {
    if (args.progress) {
      process.stderr.write(
        `corpus: ${fileIndex + 1}/${files.length} ${relative(directory, file)}\n`,
      );
    }
    const source = await readFile(file, "utf8");
    const bytes = Buffer.byteLength(source);
    const pageMetadata = metadata.get(file);
    const pageIdentity = {
      file: relative(directory, file),
      ...(pageMetadata?.title ? { title: pageMetadata.title } : {}),
      ...(Number.isSafeInteger(pageMetadata?.namespace)
        ? { namespace: pageMetadata.namespace }
        : {}),
      bytes,
    };
    report.totalBytes += bytes;
    increment(
      report.namespaceDistribution,
      Number.isSafeInteger(pageMetadata?.namespace)
        ? String(pageMetadata.namespace)
        : "unknown",
    );
    report.largestPages.push(pageIdentity);
    report.pagesProcessed++;
    try {
      parseWikitext(source, parser);
    } catch (error) {
      report.parseFailures++;
      report.failures.push({ file, kind: "parse", message: String(error) });
      continue;
    }
    const options = {
      profile: args.profile,
      parserConfig: args.parserConfig,
      ...localization,
    };
    const formattingStarted = performance.now();
    const result = formatWikitextSafeDetailed(source, options);
    const formattingMilliseconds = performance.now() - formattingStarted;
    pageTimings.push(formattingMilliseconds);
    report.slowestPages.push({
      ...pageIdentity,
      milliseconds: Number(formattingMilliseconds.toFixed(3)),
    });
    if (result.formatted !== source) report.pagesChanged++;
    if (result.warning) {
      report.warnings++;
      report.failures.push({ file, kind: "warning", message: result.warning });
    }
    const equivalenceFailures = result.equivalenceDiagnostics.filter(
      (entry) => !entry.equivalent,
    );
    report.equivalenceFailures += equivalenceFailures.length;
    for (const failure of equivalenceFailures) {
      report.failures.push({
        file,
        kind: "equivalence",
        message: failure.reason ?? `${failure.structure} fingerprint changed`,
      });
    }

    const templates = result.templateParameterDiagnostics;
    report.templatesInspected += templates.templatesInspected;
    report.templatesEligible += templates.templatesEligible;
    report.templatesChanged += templates.templatesChanged;
    report.templatesFormatted += templates.uniqueTemplatesFormatted;
    report.templatesAlreadyCanonical += templates.templatesAlreadyCanonical;
    report.templatesSkippedAmbiguous += templates.templatesSkippedAmbiguous;
    report.uniqueTemplatesFormatted += templates.uniqueTemplatesFormatted;
    const tables = result.tableFormatDiagnostics;
    report.tablesInspected += tables.tablesInspected;
    report.tablesEligible += tables.tablesEligible;
    report.tablesChanged += tables.tablesChanged;
    report.tablesFormatted += tables.tablesChanged;
    report.tablesAlreadyCanonical += tables.tablesAlreadyCanonical;
    report.tablesSkippedAmbiguous += tables.tablesSkippedAmbiguous;
    if (
      templates.templatesSkippedAmbiguous === 0 &&
      tables.tablesSkippedAmbiguous === 0 &&
      !result.warning
    ) {
      report.pagesStructurallyCovered++;
    }
    if (templates.convergenceLimitReached || tables.convergenceLimitReached) {
      report.convergenceLimitReached++;
      report.failures.push({
        file,
        kind: "convergence",
        message: "a structural formatter reached its convergence limit",
      });
    }

    const pageSkipReasons = [];
    for (const [reason, count] of Object.entries(templates.skipReasons)) {
      increment(report.skipReasons, reason, count);
      pageSkipReasons.push([reason, count]);
      report.skipDetails.push({
        ...pageIdentity,
        kind: "template",
        reason,
        count,
      });
    }
    for (const diagnostic of result.tableDiagnostics) {
      if (diagnostic.ambiguous && diagnostic.reason) {
        increment(report.skipReasons, diagnostic.reason);
        pageSkipReasons.push([diagnostic.reason, 1]);
        report.skipDetails.push({
          ...pageIdentity,
          kind: "table",
          reason: diagnostic.reason,
          count: 1,
          ...(diagnostic.semanticId
            ? { semanticId: diagnostic.semanticId }
            : {}),
          line: diagnostic.line,
          start: diagnostic.start,
          end: diagnostic.end,
        });
      }
    }
    for (const [reason, count] of pageSkipReasons) {
      if (!args.allowedSkipReasons.includes(reason)) {
        increment(report.unexplainedSkipReasons, reason, count);
      }
    }

    if (result.warning?.startsWith("Safe formatting verification failed:")) {
      report.idempotencyFailures++;
      report.failures.push({
        file,
        kind: "idempotency",
        message: result.warning,
      });
    }
  }

  report.templateCoveragePercentage = percentage(
    report.templatesChanged + report.templatesAlreadyCanonical,
    report.templatesEligible,
  );
  report.tableCoveragePercentage = percentage(
    report.tablesChanged + report.tablesAlreadyCanonical,
    report.tablesEligible,
  );
  report.pageCoveragePercentage = percentage(
    report.pagesStructurallyCovered,
    report.pagesProcessed,
  );
  report.timingMilliseconds = {
    total: Number(
      pageTimings.reduce((sum, value) => sum + value, 0).toFixed(3),
    ),
    p50: percentile(pageTimings, 0.5),
    p95: percentile(pageTimings, 0.95),
    p99: percentile(pageTimings, 0.99),
    maximum: percentile(pageTimings, 1),
  };
  report.largestPages = report.largestPages
    .sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file))
    .slice(0, 10);
  report.slowestPages = report.slowestPages
    .sort(
      (a, b) =>
        b.milliseconds - a.milliseconds || a.file.localeCompare(b.file),
    )
    .slice(0, 10);
  if (
    belowThreshold(
      report.templateCoveragePercentage,
      args.minTemplateCoverage,
    )
  ) {
    report.failures.push({
      kind: "template-coverage",
      message: `${report.templateCoveragePercentage ?? "no eligible nodes"} is below the ${args.minTemplateCoverage}% requirement`,
    });
  }
  if (
    belowThreshold(report.tableCoveragePercentage, args.minTableCoverage)
  ) {
    report.failures.push({
      kind: "table-coverage",
      message: `${report.tableCoveragePercentage ?? "no eligible nodes"} is below the ${args.minTableCoverage}% requirement`,
    });
  }
  for (const [reason, count] of Object.entries(report.unexplainedSkipReasons)) {
    report.failures.push({
      kind: "unexplained-skip",
      message: `${reason} (${count})`,
    });
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) await writeFile(resolve(args.output), json);
  process.stdout.write(json);
  if (
    report.parseFailures > 0 ||
    report.idempotencyFailures > 0 ||
    report.equivalenceFailures > 0 ||
    report.warnings > 0 ||
    report.convergenceLimitReached > 0 ||
    Object.keys(report.unexplainedSkipReasons).length > 0 ||
    belowThreshold(
      report.templateCoveragePercentage,
      args.minTemplateCoverage,
    ) ||
    belowThreshold(report.tableCoveragePercentage, args.minTableCoverage)
  ) {
    process.exitCode = 1;
  }
}

await main();

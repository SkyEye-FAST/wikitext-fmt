#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
    failures: [],
  };

  for (const file of files) {
    const source = await readFile(file, "utf8");
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
    const result = formatWikitextSafeDetailed(source, options);
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
    }
    for (const diagnostic of result.tableDiagnostics) {
      if (diagnostic.ambiguous && diagnostic.reason) {
        increment(report.skipReasons, diagnostic.reason);
        pageSkipReasons.push([diagnostic.reason, 1]);
      }
    }
    for (const [reason, count] of pageSkipReasons) {
      if (!args.allowedSkipReasons.includes(reason)) {
        increment(report.unexplainedSkipReasons, reason, count);
      }
    }

    const second = formatWikitextSafeDetailed(result.formatted, options);
    if (second.warning || second.formatted !== result.formatted) {
      report.idempotencyFailures++;
      report.failures.push({
        file,
        kind: "idempotency",
        message: second.warning ?? "second pass changed output",
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

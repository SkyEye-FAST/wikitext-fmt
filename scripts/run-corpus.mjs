import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import fg from "fast-glob";
import { formatWikitextSafeDetailed } from "../dist/index.js";
import { getParserConfig, parseWikitext } from "../dist/parser.js";

function parseArgs(argv) {
  const options = {
    directory: undefined,
    parserConfig: "mediawiki",
    profile: "production",
    output: undefined,
    siteinfo: undefined,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--parser-config") options.parserConfig = argv[++index];
    else if (arg === "--profile") options.profile = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--siteinfo") options.siteinfo = argv[++index];
    else if (arg?.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!options.directory) options.directory = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.directory) {
    throw new Error(
      "Usage: run-corpus.mjs <directory> [--parser-config name-or-path] [--profile production|aggressive] [--siteinfo file] [--output report.json]",
    );
  }
  if (options.profile !== "production" && options.profile !== "aggressive") {
    throw new Error("Corpus profile must be production or aggressive");
  }
  return options;
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
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
    pagesProcessed: 0,
    pagesChanged: 0,
    warnings: 0,
    parseFailures: 0,
    idempotencyFailures: 0,
    equivalenceFailures: 0,
    templatesInspected: 0,
    templatesFormatted: 0,
    tablesInspected: 0,
    tablesFormatted: 0,
    skipReasons: {},
    formattingCoveragePercentage: 0,
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
    const result = formatWikitextSafeDetailed(source, {
      profile: args.profile,
      parserConfig: args.parserConfig,
      ...localization,
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
    report.templatesInspected +=
      result.templateParameterDiagnostics.templatesInspected;
    report.templatesFormatted +=
      result.templateParameterDiagnostics.templatesFormatted;
    report.tablesInspected += result.tableDiagnostics.length;
    report.tablesFormatted += result.tableDiagnostics.filter(
      (entry) => entry.changed,
    ).length;
    for (const [reason, count] of Object.entries(
      result.templateParameterDiagnostics.skipReasons,
    )) {
      report.skipReasons[reason] = (report.skipReasons[reason] ?? 0) + count;
    }
    for (const diagnostic of result.tableDiagnostics) {
      if (!diagnostic.changed && diagnostic.reason) {
        increment(report.skipReasons, diagnostic.reason);
      }
    }
    const second = formatWikitextSafeDetailed(result.formatted, {
      profile: args.profile,
      parserConfig: args.parserConfig,
      ...localization,
    });
    if (second.warning || second.formatted !== result.formatted) {
      report.idempotencyFailures++;
      report.failures.push({
        file,
        kind: "idempotency",
        message: second.warning ?? "second pass changed output",
      });
    }
  }

  const inspected = report.templatesInspected + report.tablesInspected;
  const formatted = report.templatesFormatted + report.tablesFormatted;
  report.formattingCoveragePercentage =
    inspected === 0 ? 100 : Number(((formatted / inspected) * 100).toFixed(2));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) await writeFile(resolve(args.output), json);
  process.stdout.write(json);
  if (
    report.parseFailures > 0 ||
    report.idempotencyFailures > 0 ||
    report.equivalenceFailures > 0 ||
    report.warnings > 0
  ) {
    process.exitCode = 1;
  }
}

await main();

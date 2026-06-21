#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import {
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
  type FormatDetailedResult,
} from "./formatter.js";
import type { FormatOptions } from "./options.js";
import { resolveCliConfig } from "./cli/config.js";
import {
  formatterOptions,
  parseArgs,
  usage,
  type CliOptions,
} from "./cli/args.js";
import {
  prepareLocalizationOptions,
  resolvedLocalizationAliasesJson,
} from "./cli/localization.js";
import { expandInputPaths } from "./cli/paths.js";
import { createUnifiedDiff } from "./cli/diff.js";
import {
  createDiagnosticsRecord,
  serializeDiagnostics,
  type FileDiagnostics,
} from "./cli/diagnostics.js";
import { createBatchReport } from "./cli/report.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function writeReport(
  path: string | undefined,
  files: FileDiagnostics[],
): Promise<boolean> {
  if (!path) return true;
  try {
    await writeFile(
      path,
      `${JSON.stringify(createBatchReport(files), null, 2)}\n`,
      "utf8",
    );
    return true;
  } catch (error) {
    stderr.write(
      `Could not write report ${path}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
    return false;
  }
}

function runFormatter(
  source: string,
  options: CliOptions,
  formatOptions: FormatOptions,
): FormatDetailedResult {
  return options.safe
    ? formatWikitextSafeDetailed(source, formatOptions)
    : formatWikitextDetailedResult(source, formatOptions);
}

function debugResult(
  label: string,
  source: string,
  result: FormatDetailedResult,
  options: CliOptions,
  formatOptions: FormatOptions,
  configPath?: string,
): void {
  if (!options.debug) return;
  const level = formatOptions.level ?? "normal";
  const mode = options.safe ? "safe" : "normal";
  const status = result.warning
    ? "fallback"
    : result.formatted === source
      ? "unchanged"
      : "changed";
  const config = configPath ? ` config=${configPath}` : " config=defaults";
  stderr.write(
    `${label}: debug: mode=${mode} level=${level} status=${status}${config}\n`,
  );
  for (const diagnostic of result.tableDiagnostics) {
    const style = diagnostic.separatorStyle
      ? ` using ${diagnostic.separatorStyle} style`
      : "";
    const styleReason = diagnostic.separatorStyleReason
      ? `: ${diagnostic.separatorStyleReason}`
      : "";
    const outcome = diagnostic.changed
      ? `formatted${style}${styleReason}`
      : `skipped: ${diagnostic.reason ?? "unknown reason"}`;
    stderr.write(`${label}: table at line ${diagnostic.line} ${outcome}\n`);
  }
}

function reportDiagnostics(
  label: string,
  source: string,
  result: FormatDetailedResult,
  options: CliOptions,
  formatOptions: FormatOptions,
  configPath?: string,
): void {
  if (options.diagnosticsJson) {
    stderr.write(`${serializeDiagnostics(label, source, result)}\n`);
    return;
  }
  debugResult(label, source, result, options, formatOptions, configPath);
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n${usage()}\n`,
    );
    process.exitCode = 2;
    return;
  }

  let formatOptions: FormatOptions;
  let configPath: string | undefined;
  try {
    const resolved = await resolveCliConfig(formatterOptions(options), {
      configPath: options.configPath,
      noConfig: options.noConfig,
    });
    formatOptions = await prepareLocalizationOptions(options, resolved.options);
    configPath = resolved.path;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  if (options.printLocalizationAliases) {
    stdout.write(resolvedLocalizationAliasesJson(formatOptions));
    return;
  }

  if (options.stdin) {
    const source = await readStdin();
    const result = runFormatter(source, options, formatOptions);
    const diagnostics = createDiagnosticsRecord("stdin", source, result);
    reportDiagnostics(
      "stdin",
      source,
      result,
      options,
      formatOptions,
      configPath,
    );
    if (result.warning && !options.diagnosticsJson)
      stderr.write(`warning: ${result.warning}\n`);
    if (options.diff)
      stdout.write(createUnifiedDiff("stdin", source, result.formatted));
    else if (options.check)
      process.exitCode = result.formatted === source ? 0 : 1;
    else stdout.write(result.formatted);
    if (options.diff && result.formatted !== source) process.exitCode = 1;
    if (options.failOnWarning && result.warning) process.exitCode = 1;
    await writeReport(options.reportPath, [diagnostics]);
    return;
  }

  let files: string[];
  try {
    files = await expandInputPaths(options.files);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  let changed = false;
  let warned = false;
  const diagnostics: FileDiagnostics[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = runFormatter(source, options, formatOptions);
    diagnostics.push(createDiagnosticsRecord(file, source, result));
    reportDiagnostics(file, source, result, options, formatOptions, configPath);
    if (result.warning && !options.diagnosticsJson)
      stderr.write(`${file}: warning: ${result.warning}\n`);
    if (result.warning) warned = true;
    if (result.formatted !== source) changed = true;
    if (options.write) await writeFile(file, result.formatted, "utf8");
    else if (options.diff)
      stdout.write(createUnifiedDiff(file, source, result.formatted));
    else if (!options.check) stdout.write(result.formatted);
  }
  if ((options.check || options.diff) && changed) process.exitCode = 1;
  if (options.failOnWarning && warned) process.exitCode = 1;
  await writeReport(options.reportPath, diagnostics);
}

await main();

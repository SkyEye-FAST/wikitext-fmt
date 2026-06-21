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
import { expandInputPaths } from "./cli/paths.js";
import { createUnifiedDiff } from "./cli/diff.js";
import { serializeDiagnostics } from "./cli/diagnostics.js";

interface CliOptions extends FormatOptions {
  write: boolean;
  check: boolean;
  stdin: boolean;
  safe: boolean;
  debug: boolean;
  diff: boolean;
  diagnosticsJson: boolean;
  failOnWarning: boolean;
  configPath?: string;
  noConfig: boolean;
  files: string[];
}

function usage(): string {
  return "Usage: wikitext-fmt [--write | --check | --diff] [--stdin] [--safe] [--fail-on-warning] [--debug | --diagnostics-json] [--config <path> | --no-config] [--level safe|normal|experimental] [options] <file-or-glob...>";
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    write: false,
    check: false,
    stdin: false,
    safe: false,
    debug: false,
    diff: false,
    diagnosticsJson: false,
    failOnWarning: false,
    noConfig: false,
    files: [],
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    switch (arg) {
      case "--write": options.write = true; break;
      case "--check": options.check = true; break;
      case "--stdin": options.stdin = true; break;
      case "--safe": options.safe = true; break;
      case "--debug": options.debug = true; break;
      case "--diff": options.diff = true; break;
      case "--diagnostics-json": options.diagnosticsJson = true; break;
      case "--fail-on-warning": options.failOnWarning = true; break;
      case "--config": {
        const value = args[++index];
        if (!value) throw new Error("--config requires a path");
        options.configPath = value;
        break;
      }
      case "--no-config": options.noConfig = true; break;
      case "--level": {
        const value = args[++index];
        if (value !== "safe" && value !== "normal" && value !== "experimental") {
          throw new Error("--level must be safe, normal, or experimental");
        }
        options.level = value;
        break;
      }
      case "--html-void-tag-style": {
        const value = args[++index];
        if (value !== "html5" && value !== "xhtml" && value !== "preserve") {
          throw new Error("--html-void-tag-style must be html5, xhtml, or preserve");
        }
        options.htmlVoidTagStyle = value;
        break;
      }
      case "--parser-config": {
        const value = args[++index];
        if (!value) throw new Error("--parser-config requires a value");
        options.parserConfig = value;
        break;
      }
      case "--no-format-headings": options.formatHeadings = false; break;
      case "--no-format-templates": options.formatTemplates = false; break;
      case "--no-format-categories": options.formatCategories = false; break;
      case "--format-tables": options.formatTables = true; break;
      case "--no-format-tables": options.formatTables = false; break;
      case "--table-cell-separator-style": {
        const value = args[++index];
        if (value !== "auto" && value !== "split" && value !== "preserve") {
          throw new Error("--table-cell-separator-style must be auto, split, or preserve");
        }
        options.tableCellSeparatorStyle = value;
        break;
      }
      case "--no-normalize-blank-lines": options.normalizeBlankLines = false; break;
      case "--help": stdout.write(`${usage()}\n`); process.exit(0); break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        options.files.push(arg);
    }
  }
  if (options.write && options.check) throw new Error("--write and --check cannot be used together");
  if (options.write && options.diff) throw new Error("--write and --diff cannot be used together");
  if (options.debug && options.diagnosticsJson) throw new Error("--debug and --diagnostics-json cannot be used together");
  if (options.configPath && options.noConfig) throw new Error("--config and --no-config cannot be used together");
  if (options.stdin && options.files.length > 0) throw new Error("--stdin cannot be combined with file paths");
  if (options.stdin && options.write) throw new Error("--write cannot be used with --stdin");
  if (!options.stdin && options.files.length === 0) throw new Error("No input file specified");
  return options;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function formatterOptions(options: CliOptions): FormatOptions {
  const {
    write: _write,
    check: _check,
    stdin: _stdin,
    safe: _safe,
    debug: _debug,
    diff: _diff,
    diagnosticsJson: _diagnosticsJson,
    failOnWarning: _failOnWarning,
    configPath: _configPath,
    noConfig: _noConfig,
    files: _files,
    ...formatOptions
  } = options;
  return formatOptions;
}

function runFormatter(source: string, options: CliOptions, formatOptions: FormatOptions): FormatDetailedResult {
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
  const status = result.warning ? "fallback" : result.formatted === source ? "unchanged" : "changed";
  const config = configPath ? ` config=${configPath}` : " config=defaults";
  stderr.write(`${label}: debug: mode=${mode} level=${level} status=${status}${config}\n`);
  for (const diagnostic of result.tableDiagnostics) {
    const style = diagnostic.separatorStyle ? ` using ${diagnostic.separatorStyle} style` : "";
    const styleReason = diagnostic.separatorStyleReason ? `: ${diagnostic.separatorStyleReason}` : "";
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
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
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
    formatOptions = resolved.options;
    configPath = resolved.path;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  if (options.stdin) {
    const source = await readStdin();
    const result = runFormatter(source, options, formatOptions);
    reportDiagnostics("stdin", source, result, options, formatOptions, configPath);
    if (result.warning && !options.diagnosticsJson) stderr.write(`warning: ${result.warning}\n`);
    if (options.diff) stdout.write(createUnifiedDiff("stdin", source, result.formatted));
    else if (options.check) process.exitCode = result.formatted === source ? 0 : 1;
    else stdout.write(result.formatted);
    if (options.diff && result.formatted !== source) process.exitCode = 1;
    if (options.failOnWarning && result.warning) process.exitCode = 1;
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
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = runFormatter(source, options, formatOptions);
    reportDiagnostics(file, source, result, options, formatOptions, configPath);
    if (result.warning && !options.diagnosticsJson) stderr.write(`${file}: warning: ${result.warning}\n`);
    if (result.warning) warned = true;
    if (result.formatted !== source) changed = true;
    if (options.write) await writeFile(file, result.formatted, "utf8");
    else if (options.diff) stdout.write(createUnifiedDiff(file, source, result.formatted));
    else if (!options.check) stdout.write(result.formatted);
  }
  if ((options.check || options.diff) && changed) process.exitCode = 1;
  if (options.failOnWarning && warned) process.exitCode = 1;
}

await main();

#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import { formatWikitextResult, formatWikitextSafe, type FormatResult } from "./formatter.js";
import type { FormatOptions } from "./options.js";

interface CliOptions extends FormatOptions {
  write: boolean;
  check: boolean;
  stdin: boolean;
  safe: boolean;
  debug: boolean;
  files: string[];
}

function usage(): string {
  return "Usage: wikitext-fmt [--write | --check] [--stdin] [--safe] [--debug] [--level safe|normal|experimental] [--html-void-tag-style html5|xhtml|preserve] [options] <file...>";
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { write: false, check: false, stdin: false, safe: false, debug: false, files: [] };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    switch (arg) {
      case "--write": options.write = true; break;
      case "--check": options.check = true; break;
      case "--stdin": options.stdin = true; break;
      case "--safe": options.safe = true; break;
      case "--debug": options.debug = true; break;
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
      case "--no-normalize-blank-lines": options.normalizeBlankLines = false; break;
      case "--help": stdout.write(`${usage()}\n`); process.exit(0); break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        options.files.push(arg);
    }
  }
  if (options.write && options.check) throw new Error("--write and --check cannot be used together");
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
    files: _files,
    ...formatOptions
  } = options;
  return formatOptions;
}

function runFormatter(source: string, options: CliOptions): FormatResult {
  return options.safe
    ? formatWikitextSafe(source, formatterOptions(options))
    : formatWikitextResult(source, formatterOptions(options));
}

function debugResult(label: string, source: string, result: FormatResult, options: CliOptions): void {
  if (!options.debug) return;
  const level = options.level ?? "normal";
  const mode = options.safe ? "safe" : "normal";
  const status = result.warning ? "fallback" : result.formatted === source ? "unchanged" : "changed";
  stderr.write(`${label}: debug: mode=${mode} level=${level} status=${status}\n`);
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

  if (options.stdin) {
    const source = await readStdin();
    const result = runFormatter(source, options);
    debugResult("stdin", source, result, options);
    if (result.warning) stderr.write(`warning: ${result.warning}\n`);
    if (options.check) process.exitCode = result.formatted === source ? 0 : 1;
    else stdout.write(result.formatted);
    return;
  }

  let changed = false;
  for (const file of options.files) {
    const source = await readFile(file, "utf8");
    const result = runFormatter(source, options);
    debugResult(file, source, result, options);
    if (result.warning) stderr.write(`${file}: warning: ${result.warning}\n`);
    if (result.formatted !== source) changed = true;
    if (options.write) await writeFile(file, result.formatted, "utf8");
    else if (!options.check) stdout.write(result.formatted);
  }
  if (options.check && changed) process.exitCode = 1;
}

await main();

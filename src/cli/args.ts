import { stdout } from "node:process";
import type { FormatOptions } from "../options.js";

export interface CliOptions extends FormatOptions {
  write: boolean;
  check: boolean;
  stdin: boolean;
  safe: boolean;
  debug: boolean;
  diff: boolean;
  diagnosticsJson: boolean;
  failOnWarning: boolean;
  reportPath?: string;
  siteApi?: string;
  printLocalizationAliases: boolean;
  configPath?: string;
  noConfig: boolean;
  files: string[];
}

export function usage(): string {
  return "Usage: wikitext-fmt [--write | --check | --diff] [--stdin] [--safe] [--fail-on-warning] [--report <path>] [--debug | --diagnostics-json] [--config <path> | --no-config] [--level safe|normal|experimental] [options] <file-or-glob...>";
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    write: false,
    check: false,
    stdin: false,
    safe: false,
    debug: false,
    diff: false,
    diagnosticsJson: false,
    failOnWarning: false,
    printLocalizationAliases: false,
    noConfig: false,
    files: [],
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    switch (arg) {
      case "--write":
        options.write = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--stdin":
        options.stdin = true;
        break;
      case "--safe":
        options.safe = true;
        break;
      case "--debug":
        options.debug = true;
        break;
      case "--diff":
        options.diff = true;
        break;
      case "--diagnostics-json":
        options.diagnosticsJson = true;
        break;
      case "--fail-on-warning":
        options.failOnWarning = true;
        break;
      case "--print-localization-aliases":
        options.printLocalizationAliases = true;
        break;
      case "--report": {
        const value = args[++index];
        if (!value) throw new Error("--report requires a path");
        options.reportPath = value;
        break;
      }
      case "--config": {
        const value = args[++index];
        if (!value) throw new Error("--config requires a path");
        options.configPath = value;
        break;
      }
      case "--no-config":
        options.noConfig = true;
        break;
      case "--level": {
        const value = args[++index];
        if (
          value !== "safe" &&
          value !== "normal" &&
          value !== "experimental"
        ) {
          throw new Error("--level must be safe, normal, or experimental");
        }
        options.level = value;
        break;
      }
      case "--html-void-tag-style": {
        const value = args[++index];
        if (value !== "html5" && value !== "xhtml" && value !== "preserve") {
          throw new Error(
            "--html-void-tag-style must be html5, xhtml, or preserve",
          );
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
      case "--localization-source": {
        const value = args[++index];
        if (value !== "builtin" && value !== "siteinfo" && value !== "custom") {
          throw new Error(
            "--localization-source must be builtin, siteinfo, or custom",
          );
        }
        options.localizationSource = value;
        break;
      }
      case "--site-api": {
        const value = args[++index];
        if (!value) throw new Error("--site-api requires a URL");
        options.siteApi = value;
        break;
      }
      case "--localized-syntax-style": {
        const value = args[++index];
        if (value !== "preserve" && value !== "canonical-english") {
          throw new Error(
            "--localized-syntax-style must be preserve or canonical-english",
          );
        }
        options.localizedSyntaxStyle = value;
        break;
      }
      case "--no-format-headings":
        options.formatHeadings = false;
        break;
      case "--no-format-templates":
        options.formatTemplates = false;
        break;
      case "--no-format-categories":
        options.formatCategories = false;
        break;
      case "--no-format-lists":
        options.formatLists = false;
        break;
      case "--no-format-file-links":
        options.formatFileLinks = false;
        break;
      case "--no-format-behavior-switches":
        options.formatBehaviorSwitches = false;
        break;
      case "--no-format-redirects":
        options.formatRedirects = false;
        break;
      case "--behavior-switch-placement": {
        const value = args[++index];
        if (value !== "preserve" && value !== "footer") {
          throw new Error(
            "--behavior-switch-placement must be preserve or footer",
          );
        }
        options.behaviorSwitchPlacement = value;
        break;
      }
      case "--format-tables":
        options.formatTables = true;
        break;
      case "--no-format-tables":
        options.formatTables = false;
        break;
      case "--table-cell-separator-style": {
        const value = args[++index];
        if (value !== "auto" && value !== "split" && value !== "preserve") {
          throw new Error(
            "--table-cell-separator-style must be auto, split, or preserve",
          );
        }
        options.tableCellSeparatorStyle = value;
        break;
      }
      case "--no-normalize-blank-lines":
        options.normalizeBlankLines = false;
        break;
      case "--help":
        stdout.write(`${usage()}\n`);
        process.exit(0);
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        options.files.push(arg);
    }
  }
  if (options.write && options.check)
    throw new Error("--write and --check cannot be used together");
  if (options.write && options.diff)
    throw new Error("--write and --diff cannot be used together");
  if (options.debug && options.diagnosticsJson)
    throw new Error("--debug and --diagnostics-json cannot be used together");
  if (options.configPath && options.noConfig)
    throw new Error("--config and --no-config cannot be used together");
  if (options.stdin && options.files.length > 0)
    throw new Error("--stdin cannot be combined with file paths");
  if (options.stdin && options.write)
    throw new Error("--write cannot be used with --stdin");
  if (
    options.printLocalizationAliases &&
    (options.write || options.check || options.diff || options.stdin)
  ) {
    throw new Error(
      "--print-localization-aliases cannot be combined with --write, --check, --diff, or --stdin",
    );
  }
  if (
    !options.printLocalizationAliases &&
    !options.stdin &&
    options.files.length === 0
  ) {
    throw new Error("No input file specified");
  }
  return options;
}

export function formatterOptions(options: CliOptions): FormatOptions {
  const {
    write: _write,
    check: _check,
    stdin: _stdin,
    safe: _safe,
    debug: _debug,
    diff: _diff,
    diagnosticsJson: _diagnosticsJson,
    failOnWarning: _failOnWarning,
    printLocalizationAliases: _printLocalizationAliases,
    reportPath: _reportPath,
    siteApi: _siteApi,
    configPath: _configPath,
    noConfig: _noConfig,
    files: _files,
    ...formatOptions
  } = options;
  return formatOptions;
}

import { stdout } from "node:process";

import type { FormatOptions } from "../options.js";
import {
  booleanCliFlags,
  optionSchema,
  type OptionSchemaEntry,
} from "../options/schema.js";

export interface CliOptions extends FormatOptions {
  write: boolean;
  check: boolean;
  stdin: boolean;
  safe: boolean;
  unsafe: boolean;
  debug: boolean;
  diff: boolean;
  diagnosticsJson: boolean;
  failOnWarning: boolean;
  reportPath?: string;
  siteApi?: string;
  siteSnapshot?: string;
  refreshSiteConfiguration: boolean;
  printSiteConfiguration: boolean;
  validateSiteConfiguration: boolean;
  printLocalizationAliases: boolean;
  configPath?: string;
  noConfig: boolean;
  files: string[];
}

interface HelpOption {
  syntax: string;
  description: string;
}

interface FormatterValueHelp {
  name: keyof FormatOptions;
  syntax: string;
  description: string;
}

const formatterValueHelp: readonly FormatterValueHelp[] = [
  {
    name: "profile",
    syntax: "--profile <default|production>",
    description: "Select a coordinated formatter preset.",
  },
  {
    name: "level",
    syntax: "--level <safe|normal|experimental>",
    description: "Set the maximum rule reliability level.",
  },
  {
    name: "parserConfig",
    syntax: "--parser-config <name-or-json-path>",
    description: "Select a bundled parser config or JSON path.",
  },
  {
    name: "htmlVoidTagStyle",
    syntax: "--html-void-tag-style <html5|xhtml|preserve>",
    description: "Choose simple HTML void-tag spelling.",
  },
  {
    name: "tableCellSeparatorStyle",
    syntax: "--table-cell-separator-style <auto|split|preserve>",
    description: "Choose parser-confirmed inline table-cell layout.",
  },
  {
    name: "inlineTemplateSpacing",
    syntax: "--inline-template-spacing <auto|compact|spaced>",
    description: "Choose canonical single-line named-template spacing.",
  },
  {
    name: "interlanguagePlacement",
    syntax: "--interlanguage-placement <preserve|footer>",
    description: "Preserve or move eligible interlanguage links.",
  },
  {
    name: "interlanguagePrefixes",
    syntax: "--interlanguage-prefixes <a,b,...>",
    description: "Replace the recognized interlanguage prefix list.",
  },
  {
    name: "behaviorSwitchPlacement",
    syntax: "--behavior-switch-placement <preserve|footer>",
    description: "Preserve or move eligible behavior switches.",
  },
  {
    name: "localizationSource",
    syntax: "--localization-source <builtin|siteinfo|custom>",
    description: "Select the localization alias source.",
  },
  {
    name: "localizedSyntaxStyle",
    syntax: "--localized-syntax-style <preserve|canonical-english>",
    description: "Preserve aliases or emit certain canonical keywords.",
  },
];

const helpSections: readonly [
  title: string,
  options: readonly HelpOption[],
][] = [
  [
    "General",
    [
      { syntax: "--help", description: "Show this help and exit." },
      {
        syntax: "--version, -v",
        description: "Print the package version and exit before other processing.",
      },
    ],
  ],
  [
    "Input and output",
    [
      {
        syntax: "--write",
        description: "Replace input files with accepted formatter output.",
      },
      {
        syntax: "--check",
        description: "Emit no formatted text; exit 1 if changes are needed.",
      },
      {
        syntax: "--diff",
        description: "Print unified diffs; exit 1 if changes are needed.",
      },
      {
        syntax: "--stdin",
        description: "Read one input from stdin instead of file paths.",
      },
      {
        syntax: "--report <path>",
        description: "Write an aggregate JSON report to a file.",
      },
    ],
  ],
  [
    "Safety and diagnostics",
    [
      {
        syntax: "--safe",
        description: "Add a second formatting pass to verify idempotency.",
      },
      {
        syntax: "--unsafe",
        description: "Use the base single-call formatter pipeline only.",
      },
      {
        syntax: "--fail-on-warning",
        description: "Exit 1 when a structured formatter fallback occurs.",
      },
      {
        syntax: "--debug",
        description: "Write human-readable diagnostics to stderr.",
      },
      {
        syntax: "--diagnostics-json",
        description: "Write one JSON diagnostic record per input to stderr.",
      },
    ],
  ],
  [
    "Configuration and localization",
    [
      {
        syntax: "--config <path>",
        description: "Load one explicit JSON configuration file.",
      },
      {
        syntax: "--no-config",
        description: "Disable configuration-file discovery.",
      },
      {
        syntax: "--site-api <url>",
        description: "Override the MediaWiki API used for site configuration.",
      },
      {
        syntax: "--site-snapshot <path>",
        description: "Override the reproducible site snapshot path.",
      },
      {
        syntax: "--refresh-site-configuration",
        description: "Fetch and atomically update configured site data.",
      },
      {
        syntax: "--print-site-configuration",
        description: "Print the resolved sanitized site configuration as JSON.",
      },
      {
        syntax: "--validate-site-configuration",
        description: "Resolve and validate site configuration without formatting.",
      },
      {
        syntax: "--print-localization-aliases",
        description: "Print resolved aliases as JSON without formatting input.",
      },
    ],
  ],
];

export function usage(): string {
  return "Usage: wikitext-fmt [options] <file-or-glob...>\n       wikitext-fmt --stdin [options]";
}

function renderHelpSection(
  title: string,
  options: readonly HelpOption[],
): string {
  const width = Math.max(...options.map((option) => option.syntax.length));
  return `${title}:\n${options
    .map(
      (option) =>
        `  ${option.syntax.padEnd(width)}  ${option.description}`,
    )
    .join("\n")}`;
}

function schemaDefault(entry: OptionSchemaEntry | undefined): string {
  if (!entry || entry.defaultValue === undefined) return "";
  return ` Default: ${JSON.stringify(entry.defaultValue)}.`;
}

function formatterHelpOptions(): HelpOption[] {
  const valueOptions = formatterValueHelp.map((option) => {
    const schema = optionSchema.find((entry) => entry.name === option.name);
    return {
      syntax: option.syntax,
      description: `${option.description}${schemaDefault(schema)}`,
    };
  });
  const booleanOptions = optionSchema.flatMap((entry) => {
    if (entry.type !== "boolean") return [];
    const syntax = [entry.positiveFlag, entry.negativeFlag]
      .filter((flag): flag is string => Boolean(flag))
      .join(", ");
    if (!syntax) return [];
    const rule = entry.ruleName ?? String(entry.name);
    const level = entry.ruleLevel ? ` (${entry.ruleLevel} rule)` : "";
    const action =
      entry.positiveFlag && entry.negativeFlag
        ? "Enable or disable"
        : entry.positiveFlag
          ? "Enable"
          : "Disable";
    return [
      {
        syntax,
        description: `${action} ${rule}${level}.${schemaDefault(entry)}`,
      },
    ];
  });
  return [...valueOptions, ...booleanOptions];
}

export function help(): string {
  return [
    usage(),
    "",
    "Files and glob patterns may be mixed. Run modes and incompatible options",
    "are described in docs/cli.md.",
    "",
    ...helpSections.flatMap(([title, options]) => [
      renderHelpSection(title, options),
      "",
    ]),
    renderHelpSection("Formatter options", formatterHelpOptions()),
  ].join("\n");
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    write: false,
    check: false,
    stdin: false,
    safe: false,
    unsafe: false,
    debug: false,
    diff: false,
    diagnosticsJson: false,
    failOnWarning: false,
    printLocalizationAliases: false,
    refreshSiteConfiguration: false,
    printSiteConfiguration: false,
    validateSiteConfiguration: false,
    noConfig: false,
    files: [],
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    const booleanFlag = booleanCliFlags.get(arg);
    if (booleanFlag) {
      (options as unknown as Record<string, unknown>)[booleanFlag.name] =
        booleanFlag.value;
      continue;
    }
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
      case "--unsafe":
        options.unsafe = true;
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
      case "--refresh-site-configuration":
        options.refreshSiteConfiguration = true;
        break;
      case "--print-site-configuration":
        options.printSiteConfiguration = true;
        break;
      case "--validate-site-configuration":
        options.validateSiteConfiguration = true;
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
      case "--profile": {
        const value = args[++index];
        if (value !== "default" && value !== "production") {
          throw new Error("--profile must be default or production");
        }
        options.profile = value;
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
      case "--site-snapshot": {
        const value = args[++index];
        if (!value) throw new Error("--site-snapshot requires a path");
        options.siteSnapshot = value;
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
      case "--interlanguage-placement": {
        const value = args[++index];
        if (value !== "preserve" && value !== "footer") {
          throw new Error(
            "--interlanguage-placement must be preserve or footer",
          );
        }
        options.interlanguagePlacement = value;
        break;
      }
      case "--interlanguage-prefixes": {
        const value = args[++index];
        if (!value)
          throw new Error("--interlanguage-prefixes requires a value");
        options.interlanguagePrefixes = value
          .split(",")
          .map((prefix) => prefix.trim())
          .filter(Boolean);
        if (options.interlanguagePrefixes.length === 0)
          throw new Error(
            "--interlanguage-prefixes requires at least one prefix",
          );
        break;
      }
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
      case "--inline-template-spacing": {
        const value = args[++index];
        if (value !== "auto" && value !== "compact" && value !== "spaced") {
          throw new Error(
            "--inline-template-spacing must be auto, compact, or spaced",
          );
        }
        options.inlineTemplateSpacing = value;
        break;
      }
      case "--help":
        stdout.write(`${help()}\n`);
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
  if (options.safe && options.unsafe)
    throw new Error("--safe and --unsafe cannot be used together");
  if (options.stdin && options.files.length > 0)
    throw new Error("--stdin cannot be combined with file paths");
  if (options.stdin && options.write)
    throw new Error("--write cannot be used with --stdin");
  const inspectionMode =
    options.printLocalizationAliases ||
    options.printSiteConfiguration ||
    options.validateSiteConfiguration ||
    (options.refreshSiteConfiguration && !options.stdin && options.files.length === 0);
  if (
    Number(options.printLocalizationAliases) +
      Number(options.printSiteConfiguration) +
      Number(options.validateSiteConfiguration) >
    1
  ) {
    throw new Error("Configuration print/validate modes are mutually exclusive");
  }
  if (
    inspectionMode &&
    (options.write || options.check || options.diff || options.stdin)
  ) {
    throw new Error(
      "Site/configuration inspection cannot be combined with --write, --check, --diff, or --stdin",
    );
  }
  if (
    !inspectionMode &&
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
    unsafe: _unsafe,
    debug: _debug,
    diff: _diff,
    diagnosticsJson: _diagnosticsJson,
    failOnWarning: _failOnWarning,
    printLocalizationAliases: _printLocalizationAliases,
    refreshSiteConfiguration: _refreshSiteConfiguration,
    printSiteConfiguration: _printSiteConfiguration,
    validateSiteConfiguration: _validateSiteConfiguration,
    reportPath: _reportPath,
    siteApi: _siteApi,
    siteSnapshot: _siteSnapshot,
    configPath: _configPath,
    noConfig: _noConfig,
    files: _files,
    ...formatOptions
  } = options;
  return formatOptions;
}

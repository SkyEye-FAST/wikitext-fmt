import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve } from "node:path";
import type {
  FormatLevel,
  FormatOptions,
  HtmlVoidTagStyle,
  TableCellSeparatorStyle,
} from "../options.js";

export const CONFIG_FILENAMES = [
  ".wikitextfmtrc",
  ".wikitextfmtrc.json",
  "wikitext-fmt.config.json",
] as const;

export interface ConfigResolutionOptions {
  configPath?: string;
  noConfig?: boolean;
  cwd?: string;
}

export interface ResolvedCliConfig {
  options: FormatOptions;
  path?: string;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function discoverConfig(startDirectory = process.cwd()): Promise<string | undefined> {
  let directory = resolve(startDirectory);
  const root = parse(directory).root;
  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = resolve(directory, filename);
      if (await isFile(candidate)) return candidate;
    }
    if (directory === root) return undefined;
    directory = dirname(directory);
  }
}

function assertBoolean(value: unknown, key: string): asserts value is boolean {
  if (typeof value !== "boolean") throw new Error(`Configuration option ${key} must be a boolean`);
}

function assertEnum<T extends string>(value: unknown, key: string, values: readonly T[]): asserts value is T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Configuration option ${key} must be one of: ${values.join(", ")}`);
  }
}

export function validateConfig(value: unknown): FormatOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Configuration must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    "parserConfig",
    "lineWidth",
    "formatHeadings",
    "formatTemplates",
    "formatCategories",
    "formatLists",
    "formatTables",
    "tableCellSeparatorStyle",
    "normalizeBlankLines",
    "level",
    "htmlVoidTagStyle",
  ]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`Unknown configuration option: ${key}`);
  }
  if (record.parserConfig !== undefined && (typeof record.parserConfig !== "string" || !record.parserConfig)) {
    throw new Error("Configuration option parserConfig must be a non-empty string");
  }
  if (
    record.lineWidth !== undefined
    && (typeof record.lineWidth !== "number" || !Number.isFinite(record.lineWidth) || record.lineWidth <= 0)
  ) {
    throw new Error("Configuration option lineWidth must be a positive number");
  }
  for (const key of [
    "formatHeadings",
    "formatTemplates",
    "formatCategories",
    "formatLists",
    "formatTables",
    "normalizeBlankLines",
  ] as const) {
    if (record[key] !== undefined) assertBoolean(record[key], key);
  }
  if (record.level !== undefined) {
    assertEnum<FormatLevel>(record.level, "level", ["safe", "normal", "experimental"]);
  }
  if (record.htmlVoidTagStyle !== undefined) {
    assertEnum<HtmlVoidTagStyle>(record.htmlVoidTagStyle, "htmlVoidTagStyle", ["html5", "xhtml", "preserve"]);
  }
  if (record.tableCellSeparatorStyle !== undefined) {
    assertEnum<TableCellSeparatorStyle>(
      record.tableCellSeparatorStyle,
      "tableCellSeparatorStyle",
      ["auto", "split", "preserve"],
    );
  }
  return { ...record } as FormatOptions;
}

export async function loadConfig(path: string): Promise<FormatOptions> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read configuration ${path}: ${message}`);
  }
  try {
    return validateConfig(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid configuration ${path}: ${message}`);
  }
}

export async function resolveCliConfig(
  cliOptions: FormatOptions,
  resolution: ConfigResolutionOptions = {},
): Promise<ResolvedCliConfig> {
  const cwd = resolve(resolution.cwd ?? process.cwd());
  if (resolution.noConfig) return { options: { ...cliOptions } };
  const path = resolution.configPath
    ? isAbsolute(resolution.configPath) ? resolution.configPath : resolve(cwd, resolution.configPath)
    : await discoverConfig(cwd);
  if (!path) return { options: { ...cliOptions } };
  if (!(await isFile(path))) throw new Error(`Configuration file not found: ${path}`);
  const configOptions = await loadConfig(path);
  return { options: { ...configOptions, ...cliOptions }, path };
}

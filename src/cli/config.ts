import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve } from "node:path";
import type { FormatOptions, LocalizationAliases } from "../options.js";
import { behaviorSwitchIds } from "../localization/aliases.js";
import {
  booleanOptionNames,
  enumOptions,
  formatOptionNames,
} from "../options/schema.js";

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

export async function discoverConfig(
  startDirectory = process.cwd(),
): Promise<string | undefined> {
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
  if (typeof value !== "boolean")
    throw new Error(`Configuration option ${key} must be a boolean`);
}

function assertEnum<T extends string>(
  value: unknown,
  key: string,
  values: readonly T[],
): asserts value is T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(
      `Configuration option ${key} must be one of: ${values.join(", ")}`,
    );
  }
}

export function validateConfig(value: unknown): FormatOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Configuration must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>(formatOptionNames);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key))
      throw new Error(`Unknown configuration option: ${key}`);
  }
  if (
    record.parserConfig !== undefined &&
    (typeof record.parserConfig !== "string" || !record.parserConfig)
  ) {
    throw new Error(
      "Configuration option parserConfig must be a non-empty string",
    );
  }
  if (
    record.lineWidth !== undefined &&
    (typeof record.lineWidth !== "number" ||
      !Number.isFinite(record.lineWidth) ||
      record.lineWidth <= 0)
  ) {
    throw new Error("Configuration option lineWidth must be a positive number");
  }
  for (const key of booleanOptionNames) {
    if (record[key] !== undefined) assertBoolean(record[key], key);
  }
  for (const option of enumOptions) {
    if (record[option.name] !== undefined)
      assertEnum(record[option.name], option.name, option.enumValues);
  }
  if (record.interlanguagePrefixes !== undefined) {
    validateStringArray(record.interlanguagePrefixes, "interlanguagePrefixes");
  }
  if (record.localizationAliases !== undefined) {
    validateLocalizationAliases(record.localizationAliases);
  }
  return { ...record } as FormatOptions;
}

function validateStringArray(
  value: unknown,
  key: string,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error(
      `Configuration option ${key} must be an array of non-empty strings`,
    );
  }
}

function validateLocalizationAliases(
  value: unknown,
): asserts value is LocalizationAliases {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "Configuration option localizationAliases must be an object",
    );
  }
  const aliases = value as Record<string, unknown>;
  const allowed = new Set([
    "categoryNamespaces",
    "fileNamespaces",
    "defaultsortMagicWords",
    "redirectMagicWords",
    "imageOptionAliases",
    "behaviorSwitches",
  ]);
  for (const key of Object.keys(aliases)) {
    if (!allowed.has(key))
      throw new Error(`Unknown localizationAliases option: ${key}`);
  }
  if (aliases.categoryNamespaces !== undefined) {
    validateStringArray(
      aliases.categoryNamespaces,
      "localizationAliases.categoryNamespaces",
    );
  }
  if (aliases.fileNamespaces !== undefined) {
    validateStringArray(
      aliases.fileNamespaces,
      "localizationAliases.fileNamespaces",
    );
  }
  if (aliases.defaultsortMagicWords !== undefined) {
    validateStringArray(
      aliases.defaultsortMagicWords,
      "localizationAliases.defaultsortMagicWords",
    );
  }
  if (aliases.redirectMagicWords !== undefined) {
    validateStringArray(
      aliases.redirectMagicWords,
      "localizationAliases.redirectMagicWords",
    );
  }
  if (aliases.imageOptionAliases !== undefined) {
    if (
      typeof aliases.imageOptionAliases !== "object" ||
      aliases.imageOptionAliases === null ||
      Array.isArray(aliases.imageOptionAliases)
    ) {
      throw new Error(
        "Configuration option localizationAliases.imageOptionAliases must be an object",
      );
    }
    for (const [id, entries] of Object.entries(aliases.imageOptionAliases)) {
      validateStringArray(
        entries,
        `localizationAliases.imageOptionAliases.${id}`,
      );
    }
  }
  if (aliases.behaviorSwitches !== undefined) {
    if (
      typeof aliases.behaviorSwitches !== "object" ||
      aliases.behaviorSwitches === null ||
      Array.isArray(aliases.behaviorSwitches)
    ) {
      throw new Error(
        "Configuration option localizationAliases.behaviorSwitches must be an object",
      );
    }
    const validIds = new Set<string>(behaviorSwitchIds);
    for (const [id, entries] of Object.entries(aliases.behaviorSwitches)) {
      if (!validIds.has(id))
        throw new Error(`Unknown behavior switch ID: ${id}`);
      validateStringArray(
        entries,
        `localizationAliases.behaviorSwitches.${id}`,
      );
    }
  }
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
    ? isAbsolute(resolution.configPath)
      ? resolution.configPath
      : resolve(cwd, resolution.configPath)
    : await discoverConfig(cwd);
  if (!path) return { options: { ...cliOptions } };
  if (!(await isFile(path)))
    throw new Error(`Configuration file not found: ${path}`);
  const configOptions = await loadConfig(path);
  return { options: { ...configOptions, ...cliOptions }, path };
}

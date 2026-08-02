import {
  behaviorSwitchIds,
  overrideLocalizationAliases,
} from "./localization/aliases.js";
import type { SiteInfoFormattingData } from "./localization/siteinfo.js";
import type { FormatOptions, LocalizationAliases } from "./options.js";
import {
  booleanOptionNames,
  enumOptions,
  formatOptionNames,
} from "./options/schema.js";

export interface SiteConfiguration {
  apiUrl?: string;
  parserConfig?: string;
  parserConfigGeneration?: ParserConfigGenerationOptions;
  snapshotPath?: string;
  cachePath?: string;
  cacheMaxAgeSeconds?: number;
  allowStaleCache?: boolean;
}

export interface ParserConfigGenerationOptions {
  method?: "codemirror";
  scriptPath?: string;
  outputPath?: string;
  timeoutMilliseconds?: number;
  maxModuleBytes?: number;
}

export interface ProjectConfig extends FormatOptions {
  site?: SiteConfiguration;
}

export interface SiteConfigurationSnapshot {
  schemaVersion: 1;
  apiUrl: string;
  fetchedAt: string;
  formatterData: SiteInfoFormattingData;
}

export type SiteConfigurationSource =
  | "none"
  | "snapshot"
  | "fresh-cache"
  | "network"
  | "stale-cache";

export interface ResolvedSiteConfiguration {
  source: SiteConfigurationSource;
  apiUrl?: string;
  apiUrlSource?: "project" | "override" | "snapshot";
  parserConfig: string;
  parserConfigSource: "default" | "site" | "project" | "override";
  snapshotPath?: string;
  cachePath?: string;
  fetchedAt?: string;
  stale: boolean;
  aliasesApplied: boolean;
  prefixesApplied: boolean;
  explicitLocalizationAliases: boolean;
  explicitInterlanguagePrefixes: boolean;
  formatterData?: SiteInfoFormattingData;
  excludedInterlanguagePrefixes: string[];
  diagnostics: string[];
}

const siteConfigurationKeys = new Set([
  "apiUrl",
  "parserConfig",
  "parserConfigGeneration",
  "snapshotPath",
  "cachePath",
  "cacheMaxAgeSeconds",
  "allowStaleCache",
]);

function assertRecord(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertNonEmptyString(value: unknown, key: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Configuration option ${key} must be a non-empty string`);
  }
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
  key = "localizationAliases",
): asserts value is LocalizationAliases {
  assertRecord(value, `Configuration option ${key} must be an object`);
  const allowed = new Set([
    "categoryNamespaces",
    "fileNamespaces",
    "defaultsortMagicWords",
    "redirectMagicWords",
    "imageOptionAliases",
    "behaviorSwitches",
  ]);
  for (const aliasKey of Object.keys(value)) {
    if (!allowed.has(aliasKey)) {
      throw new Error(`Unknown ${key} option: ${aliasKey}`);
    }
  }
  for (const arrayKey of [
    "categoryNamespaces",
    "fileNamespaces",
    "defaultsortMagicWords",
    "redirectMagicWords",
  ] as const) {
    if (value[arrayKey] !== undefined) {
      validateStringArray(value[arrayKey], `${key}.${arrayKey}`);
    }
  }
  if (value.imageOptionAliases !== undefined) {
    assertRecord(
      value.imageOptionAliases,
      `Configuration option ${key}.imageOptionAliases must be an object`,
    );
    for (const [id, aliases] of Object.entries(value.imageOptionAliases)) {
      validateStringArray(aliases, `${key}.imageOptionAliases.${id}`);
    }
  }
  if (value.behaviorSwitches !== undefined) {
    assertRecord(
      value.behaviorSwitches,
      `Configuration option ${key}.behaviorSwitches must be an object`,
    );
    const validIds = new Set<string>(behaviorSwitchIds);
    for (const [id, aliases] of Object.entries(value.behaviorSwitches)) {
      if (!validIds.has(id)) throw new Error(`Unknown behavior switch ID: ${id}`);
      validateStringArray(aliases, `${key}.behaviorSwitches.${id}`);
    }
  }
}

function validateFormatOptions(record: Record<string, unknown>): void {
  if (record.parserConfig !== undefined) {
    assertNonEmptyString(record.parserConfig, "parserConfig");
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
    if (record[key] !== undefined && typeof record[key] !== "boolean") {
      throw new Error(`Configuration option ${key} must be a boolean`);
    }
  }
  for (const option of enumOptions) {
    const value = record[option.name];
    if (
      value !== undefined &&
      (typeof value !== "string" || !option.enumValues.includes(value))
    ) {
      throw new Error(
        `Configuration option ${option.name} must be one of: ${option.enumValues.join(", ")}`,
      );
    }
  }
  if (record.interlanguagePrefixes !== undefined) {
    validateStringArray(record.interlanguagePrefixes, "interlanguagePrefixes");
  }
  if (record.localizationAliases !== undefined) {
    validateLocalizationAliases(record.localizationAliases);
  }
}

export function validateSiteApiUrl(value: unknown, key = "site.apiUrl"): string {
  assertNonEmptyString(value, key);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `Configuration option ${key} must be an absolute HTTP or HTTPS URL`,
    );
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error(
      `Configuration option ${key} must be an absolute HTTP or HTTPS URL without credentials`,
    );
  }
  return value;
}

function validatePositiveInteger(value: unknown, key: string): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(`Configuration option ${key} must be a finite positive integer`);
  }
}

function validateParserConfigGeneration(value: unknown): void {
  const key = "site.parserConfigGeneration";
  assertRecord(value, `Configuration option ${key} must be an object`);
  const allowed = new Set([
    "method",
    "scriptPath",
    "outputPath",
    "timeoutMilliseconds",
    "maxModuleBytes",
  ]);
  for (const childKey of Object.keys(value)) {
    if (!allowed.has(childKey)) {
      throw new Error(`Unknown configuration option: ${key}.${childKey}`);
    }
  }
  if (value.method !== undefined && value.method !== "codemirror") {
    throw new Error(`Configuration option ${key}.method must be codemirror`);
  }
  if (value.scriptPath !== undefined) {
    validateSiteApiUrl(value.scriptPath, `${key}.scriptPath`);
  }
  if (value.outputPath !== undefined) {
    assertNonEmptyString(value.outputPath, `${key}.outputPath`);
  }
  if (value.timeoutMilliseconds !== undefined) {
    validatePositiveInteger(value.timeoutMilliseconds, `${key}.timeoutMilliseconds`);
  }
  if (value.maxModuleBytes !== undefined) {
    validatePositiveInteger(value.maxModuleBytes, `${key}.maxModuleBytes`);
  }
}

export function sanitizedSiteApiUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function validateProjectConfig(value: unknown): ProjectConfig {
  assertRecord(value, "Configuration must be a JSON object");
  const allowed = new Set<string>([...formatOptionNames, "site"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown configuration option: ${key}`);
  }
  validateFormatOptions(value);
  if (value.site !== undefined) {
    assertRecord(value.site, "Configuration option site must be an object");
    for (const key of Object.keys(value.site)) {
      if (!siteConfigurationKeys.has(key)) {
        throw new Error(`Unknown configuration option: site.${key}`);
      }
    }
    if (value.site.apiUrl !== undefined) validateSiteApiUrl(value.site.apiUrl);
    if (value.site.parserConfigGeneration !== undefined) {
      validateParserConfigGeneration(value.site.parserConfigGeneration);
    }
    for (const key of ["parserConfig", "snapshotPath", "cachePath"] as const) {
      if (value.site[key] !== undefined) {
        assertNonEmptyString(value.site[key], `site.${key}`);
      }
    }
    if (
      value.site.cacheMaxAgeSeconds !== undefined &&
      (typeof value.site.cacheMaxAgeSeconds !== "number" ||
        !Number.isFinite(value.site.cacheMaxAgeSeconds) ||
        value.site.cacheMaxAgeSeconds < 0)
    ) {
      throw new Error(
        "Configuration option site.cacheMaxAgeSeconds must be a finite non-negative number",
      );
    }
    if (
      value.site.allowStaleCache !== undefined &&
      typeof value.site.allowStaleCache !== "boolean"
    ) {
      throw new Error(
        "Configuration option site.allowStaleCache must be a boolean",
      );
    }
  }
  return { ...value } as ProjectConfig;
}

function normalizeFormatterData(value: unknown): SiteInfoFormattingData {
  assertRecord(value, "Site configuration snapshot formatterData must be an object");
  const allowed = new Set(["localizationAliases", "interlanguagePrefixes"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown site configuration formatterData option: ${key}`);
    }
  }
  validateLocalizationAliases(
    value.localizationAliases,
    "site snapshot formatterData.localizationAliases",
  );
  validateStringArray(
    value.interlanguagePrefixes,
    "site snapshot formatterData.interlanguagePrefixes",
  );
  const aliases = value.localizationAliases;
  const normalizeAliasMap = (
    map: Record<string, string[]> | undefined,
  ): Record<string, string[]> | undefined =>
    map
      ? Object.fromEntries(
          Object.entries(map)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([id, entries]) => [id, [...entries]]),
        )
      : undefined;
  return {
    localizationAliases: {
      ...(aliases.categoryNamespaces
        ? { categoryNamespaces: [...aliases.categoryNamespaces] }
        : {}),
      ...(aliases.fileNamespaces
        ? { fileNamespaces: [...aliases.fileNamespaces] }
        : {}),
      ...(aliases.defaultsortMagicWords
        ? { defaultsortMagicWords: [...aliases.defaultsortMagicWords] }
        : {}),
      ...(aliases.redirectMagicWords
        ? { redirectMagicWords: [...aliases.redirectMagicWords] }
        : {}),
      ...(aliases.imageOptionAliases
        ? { imageOptionAliases: normalizeAliasMap(aliases.imageOptionAliases) }
        : {}),
      ...(aliases.behaviorSwitches
        ? { behaviorSwitches: normalizeAliasMap(aliases.behaviorSwitches) }
        : {}),
    },
    interlanguagePrefixes: [...value.interlanguagePrefixes],
  };
}

export function normalizeSiteConfigurationSnapshot(
  value: unknown,
  expectedApiUrl?: string,
): SiteConfigurationSnapshot {
  assertRecord(value, "Site configuration snapshot must be a JSON object");
  const allowed = new Set([
    "schemaVersion",
    "apiUrl",
    "fetchedAt",
    "formatterData",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown site configuration snapshot option: ${key}`);
    }
  }
  if (value.schemaVersion !== 1) {
    throw new Error(
      `Unsupported site configuration snapshot schemaVersion: ${String(value.schemaVersion)}`,
    );
  }
  const apiUrl = sanitizedSiteApiUrl(validateSiteApiUrl(value.apiUrl, "snapshot.apiUrl"));
  if (expectedApiUrl && apiUrl !== sanitizedSiteApiUrl(expectedApiUrl)) {
    throw new Error(
      `Site configuration snapshot API URL mismatch: expected ${sanitizedSiteApiUrl(expectedApiUrl)}, found ${apiUrl}`,
    );
  }
  assertNonEmptyString(value.fetchedAt, "snapshot.fetchedAt");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      value.fetchedAt,
    ) ||
    !Number.isFinite(Date.parse(value.fetchedAt))
  ) {
    throw new Error("Configuration option snapshot.fetchedAt must be an ISO timestamp");
  }
  return {
    schemaVersion: 1,
    apiUrl,
    fetchedAt: new Date(value.fetchedAt).toISOString(),
    formatterData: normalizeFormatterData(value.formatterData),
  };
}

export function serializeSiteConfigurationSnapshot(
  snapshot: SiteConfigurationSnapshot,
): string {
  return `${JSON.stringify(normalizeSiteConfigurationSnapshot(snapshot), null, 2)}\n`;
}

export function applySiteFormattingData(
  options: FormatOptions,
  formatterData: SiteInfoFormattingData | undefined,
): FormatOptions {
  if (!formatterData) return { ...options };
  const useSiteAliases = options.localizationSource !== "builtin";
  return {
    ...options,
    ...(useSiteAliases
      ? {
          localizationSource: "custom" as const,
          localizationAliases: overrideLocalizationAliases(
            formatterData.localizationAliases,
            options.localizationAliases,
          ),
        }
      : {}),
    interlanguagePrefixes:
      options.interlanguagePrefixes ?? formatterData.interlanguagePrefixes,
  };
}

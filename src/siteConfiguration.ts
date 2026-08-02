import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadSiteInfoFormattingData } from "./localization/siteinfo.js";
import type { FormatOptions } from "./options.js";
import { getParserConfig } from "./parser.node.js";
import {
  applySiteFormattingData,
  normalizeSiteConfigurationSnapshot,
  type ProjectConfig,
  type ResolvedSiteConfiguration,
  sanitizedSiteApiUrl,
  serializeSiteConfigurationSnapshot,
  type SiteConfiguration,
  type SiteConfigurationSnapshot,
  validateProjectConfig,
  validateSiteApiUrl,
} from "./projectConfig.js";

const DEFAULT_CACHE_MAX_AGE_SECONDS = 86_400;

export interface SiteConfigurationStorage {
  read(path: string): Promise<string>;
  writeAtomic(path: string, contents: string): Promise<void>;
}

export interface ResolveProjectConfigurationOptions {
  projectConfig?: ProjectConfig;
  formatterOverrides?: FormatOptions;
  siteOverrides?: SiteConfiguration;
  refresh?: boolean;
  allowNetwork?: boolean;
  allowCache?: boolean;
  defaultCacheDirectory?: string;
  fetchImplementation?: typeof fetch;
  storage?: SiteConfigurationStorage;
  now?: () => Date;
}

export interface ResolvedProjectConfiguration {
  options: FormatOptions;
  siteConfiguration: ResolvedSiteConfiguration;
  snapshot?: SiteConfigurationSnapshot;
}

const defaultStorage: SiteConfigurationStorage = {
  read: (path) => readFile(path, "utf8"),
  async writeAtomic(path, contents) {
    const absolutePath = resolve(path);
    await mkdir(dirname(absolutePath), { recursive: true });
    const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, absolutePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  },
};

const memoryCache = new Map<string, SiteConfigurationSnapshot>();
const inFlightLoads = new Map<string, Promise<SiteConfigurationSnapshot>>();

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizedNetworkError(error: unknown, apiUrl: string): Error {
  const safeApiUrl = sanitizedSiteApiUrl(apiUrl);
  return new Error(message(error).split(apiUrl).join(safeApiUrl));
}

function cacheFilename(apiUrl: string): string {
  const key = createHash("sha256").update(apiUrl).digest("hex");
  return `site-configuration-${key}.json`;
}

function isFresh(
  snapshot: SiteConfigurationSnapshot,
  now: Date,
  maxAgeSeconds: number,
): boolean {
  if (maxAgeSeconds === 0) return false;
  const ageMilliseconds = now.getTime() - Date.parse(snapshot.fetchedAt);
  return ageMilliseconds >= 0 && ageMilliseconds <= maxAgeSeconds * 1_000;
}

async function readSnapshot(
  path: string,
  storage: SiteConfigurationStorage,
  expectedApiUrl?: string,
): Promise<SiteConfigurationSnapshot> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await storage.read(path)) as unknown;
  } catch (error) {
    throw new Error(`Could not read site configuration ${path}: ${message(error)}`);
  }
  try {
    return normalizeSiteConfigurationSnapshot(parsed, expectedApiUrl);
  } catch (error) {
    throw new Error(`Invalid site configuration ${path}: ${message(error)}`);
  }
}

export async function loadSiteConfigurationSnapshot(
  path: string,
  options: {
    expectedApiUrl?: string;
    storage?: SiteConfigurationStorage;
  } = {},
): Promise<SiteConfigurationSnapshot> {
  return readSnapshot(
    resolve(path),
    options.storage ?? defaultStorage,
    options.expectedApiUrl,
  );
}

async function loadFromNetwork(
  apiUrl: string,
  fetchImplementation: typeof fetch,
  now: () => Date,
): Promise<SiteConfigurationSnapshot> {
  const key = new URL(apiUrl).toString();
  const current = inFlightLoads.get(key);
  if (current) return current;
  const pending = (async () => ({
    schemaVersion: 1 as const,
    apiUrl: sanitizedSiteApiUrl(apiUrl),
    fetchedAt: now().toISOString(),
    formatterData: await loadSiteInfoFormattingData(apiUrl, fetchImplementation),
  }))();
  inFlightLoads.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlightLoads.delete(key);
  }
}

function parserNamespaceNames(parserConfig: string): Set<string> {
  let config: unknown;
  try {
    config = getParserConfig(parserConfig);
  } catch (error) {
    throw new Error(
      `Invalid parser configuration "${parserConfig}": ${message(error)}`,
    );
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error(
      `Invalid parser configuration "${parserConfig}": expected an object`,
    );
  }
  const record = config as Record<string, unknown>;
  for (const key of [
    "doubleUnderscore",
    "ext",
    "functionHook",
    "html",
    "interwiki",
    "parserFunction",
    "redirection",
    "variable",
    "variants",
  ]) {
    if (!Array.isArray(record[key])) {
      throw new Error(
        `Invalid parser configuration "${parserConfig}": ${key} must be an array`,
      );
    }
  }
  for (const key of ["img", "namespaces", "nsid"] as const) {
    const value = record[key];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(
        `Invalid parser configuration "${parserConfig}": ${key} must be an object`,
      );
    }
  }
  if (typeof record.protocol !== "string") {
    throw new Error(
      `Invalid parser configuration "${parserConfig}": protocol must be a string`,
    );
  }
  const namespaceIds = record.nsid as Record<string, unknown>;
  if (namespaceIds[""] !== 0) {
    throw new Error(
      `Invalid parser configuration "${parserConfig}": nsid must define the main namespace as 0`,
    );
  }
  for (const [name, id] of Object.entries(namespaceIds)) {
    if (typeof id !== "number" || !Number.isInteger(id)) {
      throw new Error(
        `Invalid parser configuration "${parserConfig}": nsid.${name} must be an integer`,
      );
    }
  }
  return new Set(
    Object.keys(namespaceIds).map((name) =>
      name.replaceAll("_", " ").trim().toLowerCase(),
    ),
  );
}

function parserSource(
  project: ProjectConfig,
  overrides: FormatOptions,
  site: SiteConfiguration,
  siteOverrides: SiteConfiguration | undefined,
): ResolvedSiteConfiguration["parserConfigSource"] {
  if (overrides.parserConfig !== undefined) return "override";
  if (siteOverrides?.parserConfig !== undefined) return "override";
  if (project.parserConfig !== undefined) return "project";
  if (site.parserConfig !== undefined) return "site";
  return "default";
}

function emptyResult(
  parserConfig: string,
  parserConfigSource: ResolvedSiteConfiguration["parserConfigSource"],
  diagnostics: string[] = [],
): ResolvedSiteConfiguration {
  return {
    source: "none",
    parserConfig,
    parserConfigSource,
    stale: false,
    aliasesApplied: false,
    prefixesApplied: false,
    explicitLocalizationAliases: false,
    explicitInterlanguagePrefixes: false,
    excludedInterlanguagePrefixes: [],
    diagnostics,
  };
}

export async function resolveProjectConfiguration(
  resolution: ResolveProjectConfigurationOptions = {},
): Promise<ResolvedProjectConfiguration> {
  const project = validateProjectConfig(resolution.projectConfig ?? {});
  const validatedOverrides = validateProjectConfig(
    resolution.formatterOverrides ?? {},
  );
  const { site: _overrideSite, ...overrides } = validatedOverrides;
  const siteOverrides = resolution.siteOverrides
    ? validateProjectConfig({ site: resolution.siteOverrides }).site
    : undefined;
  const site = { ...project.site, ...siteOverrides };
  const parserConfig =
    overrides.parserConfig ??
    siteOverrides?.parserConfig ??
    project.parserConfig ??
    site.parserConfig ??
    "mediawiki";
  const parserConfigSource = parserSource(
    project,
    overrides,
    site,
    siteOverrides,
  );
  const baseOptions: FormatOptions = {
    ...project,
    ...overrides,
    parserConfig,
  };
  delete (baseOptions as ProjectConfig).site;

  // Validate early even when no remote site data is requested.
  const namespaceNames = parserNamespaceNames(parserConfig);
  const hasSiteRequest =
    Object.keys(site).length > 0 || baseOptions.localizationSource === "siteinfo";
  if (!hasSiteRequest) {
    return {
      options: baseOptions,
      siteConfiguration: emptyResult(parserConfig, parserConfigSource),
    };
  }

  const storage = resolution.storage ?? defaultStorage;
  const now = resolution.now ?? (() => new Date());
  const allowNetwork = resolution.allowNetwork ?? true;
  const allowCache = resolution.allowCache ?? true;
  const refresh = resolution.refresh ?? false;
  const diagnostics: string[] = [];
  const apiUrl = site.apiUrl;
  if (apiUrl !== undefined) validateSiteApiUrl(apiUrl);
  const safeApiUrl = apiUrl ? sanitizedSiteApiUrl(apiUrl) : undefined;
  const cacheKey = apiUrl ? new URL(apiUrl).toString() : undefined;
  const snapshotPath = site.snapshotPath ? resolve(site.snapshotPath) : undefined;
  const cachePath = site.cachePath
    ? resolve(site.cachePath)
    : resolution.defaultCacheDirectory && safeApiUrl
      ? resolve(resolution.defaultCacheDirectory, cacheFilename(cacheKey!))
      : undefined;
  const maxAgeSeconds =
    site.cacheMaxAgeSeconds ?? DEFAULT_CACHE_MAX_AGE_SECONDS;
  let selected: SiteConfigurationSnapshot | undefined;
  let selectedSource: ResolvedSiteConfiguration["source"] = "none";
  let staleCandidate: SiteConfigurationSnapshot | undefined;

  if (snapshotPath && !refresh) {
    selected = await readSnapshot(snapshotPath, storage, apiUrl);
    selectedSource = "snapshot";
  }

  if (!selected && apiUrl && !refresh && allowCache) {
    const memory = memoryCache.get(cacheKey!);
    if (memory) {
      if (maxAgeSeconds === 0 || isFresh(memory, now(), maxAgeSeconds)) {
        selected = memory;
        selectedSource = "fresh-cache";
      } else {
        staleCandidate = memory;
      }
    }
    if (!selected && cachePath) {
      try {
        const cached = await readSnapshot(cachePath, storage, apiUrl);
        if (isFresh(cached, now(), maxAgeSeconds)) {
          selected = cached;
          selectedSource = "fresh-cache";
          memoryCache.set(cacheKey!, cached);
        } else {
          staleCandidate = cached;
        }
      } catch (error) {
        diagnostics.push(message(error));
      }
    }
  }

  if (!selected && apiUrl) {
    if (!allowNetwork) {
      throw new Error(
        "MediaWiki site configuration requires network access, but network access is disabled",
      );
    }
    try {
      selected = await loadFromNetwork(
        apiUrl,
        resolution.fetchImplementation ?? fetch,
        now,
      );
      selectedSource = "network";
    } catch (error) {
      const sanitizedError = sanitizedNetworkError(error, apiUrl);
      if (staleCandidate && site.allowStaleCache) {
        selected = staleCandidate;
        selectedSource = "stale-cache";
        diagnostics.push(
          `Using stale site configuration after network failure: ${sanitizedError.message}`,
        );
      } else {
        throw sanitizedError;
      }
    }
  }

  if (selected && selectedSource === "network") {
    const serialized = serializeSiteConfigurationSnapshot(selected);
    if (allowCache && cachePath) await storage.writeAtomic(cachePath, serialized);
    if (snapshotPath && refresh) {
      await storage.writeAtomic(snapshotPath, serialized);
    }
    memoryCache.set(cacheKey!, selected);
  }

  if (!selected && baseOptions.localizationSource === "siteinfo") {
    throw new Error(
      "Siteinfo localization was requested, but no site API or snapshot is configured",
    );
  }
  if (refresh && snapshotPath && !apiUrl) {
    throw new Error("Refreshing a site configuration snapshot requires site.apiUrl");
  }

  const explicitPrefixes = baseOptions.interlanguagePrefixes !== undefined;
  const aliasesApplied =
    selected !== undefined && baseOptions.localizationSource !== "builtin";
  const applied = applySiteFormattingData(baseOptions, selected?.formatterData);
  const candidatePrefixes = applied.interlanguagePrefixes ?? [];
  const excludedInterlanguagePrefixes = candidatePrefixes.filter((prefix) =>
    namespaceNames.has(prefix.replaceAll("_", " ").trim().toLowerCase()),
  );
  if (excludedInterlanguagePrefixes.length > 0) {
    applied.interlanguagePrefixes = candidatePrefixes.filter(
      (prefix) => !excludedInterlanguagePrefixes.includes(prefix),
    );
    diagnostics.push(
      `Excluded interlanguage prefixes that conflict with local namespaces: ${excludedInterlanguagePrefixes.join(", ")}`,
    );
  }

  const resolvedSite: ResolvedSiteConfiguration = {
    source: selectedSource,
    ...(selected
      ? {
          apiUrl: selected.apiUrl,
          apiUrlSource: apiUrl
            ? siteOverrides?.apiUrl !== undefined
              ? "override"
              : "project"
            : "snapshot",
        }
      : safeApiUrl
        ? {
            apiUrl: safeApiUrl,
            apiUrlSource: siteOverrides?.apiUrl ? "override" : "project",
          }
        : {}),
    parserConfig,
    parserConfigSource,
    ...(snapshotPath ? { snapshotPath } : {}),
    ...(cachePath ? { cachePath } : {}),
    ...(selected ? { fetchedAt: selected.fetchedAt, formatterData: selected.formatterData } : {}),
    stale: selectedSource === "stale-cache",
    aliasesApplied,
    prefixesApplied: selected !== undefined && !explicitPrefixes,
    explicitLocalizationAliases:
      baseOptions.localizationAliases !== undefined,
    explicitInterlanguagePrefixes: explicitPrefixes,
    excludedInterlanguagePrefixes,
    diagnostics,
  };
  return { options: applied, siteConfiguration: resolvedSite, ...(selected ? { snapshot: selected } : {}) };
}

export function clearSiteConfigurationMemoryCache(): void {
  memoryCache.clear();
}

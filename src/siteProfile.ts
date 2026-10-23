import { normalizeSiteInfoFormattingPayload } from "./localization/siteinfo.js";
import type { FormatOptions } from "./options.js";
import { validateProjectConfig, validateSiteApiUrl } from "./projectConfig.js";

export type InterfaceText = string | Record<string, string>;

export interface SiteProfileTemplateParameter {
  label?: InterfaceText;
  description?: InterfaceText;
  type?: string;
  required?: boolean;
  suggested?: boolean;
  deprecated?: boolean | string;
  aliases?: string[];
  default?: InterfaceText;
  example?: InterfaceText;
  autovalue?: InterfaceText;
  suggestedvalues?: string[];
  [key: string]: unknown;
}

export interface SiteProfileTemplate {
  description?: InterfaceText;
  params?: Record<string, SiteProfileTemplateParameter>;
  paramOrder?: string[];
  format?: string;
  sets?: unknown;
  maps?: unknown;
  [key: string]: unknown;
}

export interface SiteProfileInterwiki {
  prefix: string;
  url?: string;
  language?: string;
  local?: boolean;
}

export interface SiteProfile {
  schemaVersion: 1;
  name: string;
  apiUrl?: string;
  articlePath?: string;
  extensions: { templateData: boolean };
  interwiki?: SiteProfileInterwiki[];
  templates?: Record<string, SiteProfileTemplate>;
  formatter?: Omit<FormatOptions, "parserConfig">;
}

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
interface JsonObject {
  [key: string]: JsonValue;
}

function record(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Site profile option ${path} must be an object`);
  }
}

function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path = "",
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`Unknown site profile option: ${path}${key}`);
    }
  }
}

function string(
  value: unknown,
  path: string,
  nonEmpty = false,
): asserts value is string {
  if (typeof value !== "string" || (nonEmpty && value.trim().length === 0)) {
    throw new Error(
      `Site profile option ${path} must be a ${nonEmpty ? "non-empty " : ""}string`,
    );
  }
}

function stringArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`Site profile option ${path} must be an array of strings`);
  }
  value.forEach((entry, index) => string(entry, `${path}[${index}]`));
}

function interfaceText(value: unknown, path: string): void {
  if (typeof value === "string") return;
  record(value, path);
  for (const [language, text] of Object.entries(value)) {
    string(text, `${path}.${language}`);
  }
}

// Opaque TemplateData fields still have to be JSON. Copy them without retaining
// caller-owned objects, and use entries so keys such as __proto__ remain data.
function jsonCopy(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new Error(`Site profile option ${path} must be JSON`);
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new Error(`Site profile option ${path} must be JSON`);
  }
  ancestors.add(value);
  const copy = Array.isArray(value)
    ? value.map((entry, index) =>
        jsonCopy(entry, `${path}[${index}]`, ancestors),
      )
    : Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          jsonCopy(entry, `${path}.${key}`, ancestors),
        ]),
      );
  ancestors.delete(value);
  return copy;
}

function template(value: unknown, path: string): SiteProfileTemplate {
  record(value, path);
  if (value.description !== undefined)
    interfaceText(value.description, `${path}.description`);
  if (value.format !== undefined) string(value.format, `${path}.format`);
  if (value.paramOrder !== undefined)
    stringArray(value.paramOrder, `${path}.paramOrder`);
  if (value.params !== undefined) {
    record(value.params, `${path}.params`);
    for (const [name, parameter] of Object.entries(value.params)) {
      const parameterPath = `${path}.params.${name}`;
      record(parameter, parameterPath);
      for (const key of [
        "label",
        "description",
        "default",
        "example",
        "autovalue",
      ]) {
        if (parameter[key] !== undefined)
          interfaceText(parameter[key], `${parameterPath}.${key}`);
      }
      if (parameter.type !== undefined)
        string(parameter.type, `${parameterPath}.type`);
      for (const key of ["required", "suggested"]) {
        if (
          parameter[key] !== undefined &&
          typeof parameter[key] !== "boolean"
        ) {
          throw new Error(
            `Site profile option ${parameterPath}.${key} must be a boolean`,
          );
        }
      }
      if (
        parameter.deprecated !== undefined &&
        typeof parameter.deprecated !== "boolean" &&
        typeof parameter.deprecated !== "string"
      ) {
        throw new Error(
          `Site profile option ${parameterPath}.deprecated must be a boolean or string`,
        );
      }
      for (const key of ["aliases", "suggestedvalues"]) {
        if (parameter[key] !== undefined)
          stringArray(parameter[key], `${parameterPath}.${key}`);
      }
    }
  }
  return jsonCopy(value, path) as SiteProfileTemplate;
}

function formatter(value: unknown): Omit<FormatOptions, "parserConfig"> {
  record(value, "formatter");
  for (const key of ["parserConfig", "site"]) {
    if (Object.hasOwn(value, key)) {
      throw new Error(`Site profile option formatter.${key} is not allowed`);
    }
  }
  try {
    validateProjectConfig(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message
        .replace(/Configuration option /gu, "Site profile option formatter.")
        .replace(
          /Unknown configuration option: /gu,
          "Unknown site profile option: formatter.",
        )
        .replace(
          /Unknown localizationAliases option: (.+)/gu,
          "Unknown site profile option: formatter.localizationAliases.$1",
        )
        .replace(
          /Unknown behavior switch ID: (.+)/gu,
          "Unknown site profile option: formatter.localizationAliases.behaviorSwitches.$1",
        ),
    );
  }
  return jsonCopy(value, "formatter") as Omit<FormatOptions, "parserConfig">;
}

export function normalizeSiteProfile(value: unknown): SiteProfile {
  record(value, "profile");
  keys(value, [
    "$schema",
    "schemaVersion",
    "name",
    "apiUrl",
    "articlePath",
    "extensions",
    "interwiki",
    "templates",
    "formatter",
  ]);
  if (value.schemaVersion !== 1) {
    throw new Error("Site profile option schemaVersion must be 1");
  }
  string(value.name, "name", true);
  const result: SiteProfile = {
    schemaVersion: 1,
    name: value.name,
    extensions: { templateData: true },
  };
  if (value.apiUrl !== undefined) {
    result.apiUrl = validateSiteApiUrl(value.apiUrl, "apiUrl");
  }
  if (value.articlePath !== undefined) {
    const articlePath = validateSiteApiUrl(value.articlePath, "articlePath");
    if (!articlePath.includes("$1")) {
      throw new Error("Site profile option articlePath must contain $1");
    }
    result.articlePath = articlePath;
  }
  if (value.extensions !== undefined) {
    record(value.extensions, "extensions");
    keys(value.extensions, ["templateData"], "extensions.");
    if (value.extensions.templateData !== undefined) {
      if (typeof value.extensions.templateData !== "boolean") {
        throw new Error(
          "Site profile option extensions.templateData must be a boolean",
        );
      }
      result.extensions.templateData = value.extensions.templateData;
    }
  }
  if (value.interwiki !== undefined) {
    if (!Array.isArray(value.interwiki)) {
      throw new Error("Site profile option interwiki must be an array");
    }
    result.interwiki = value.interwiki.map((entry: unknown, index) => {
      const path = `interwiki[${index}]`;
      record(entry, path);
      keys(entry, ["prefix", "url", "language", "local"], `${path}.`);
      string(entry.prefix, `${path}.prefix`, true);
      const normalized: SiteProfileInterwiki = {
        prefix: entry.prefix.trim().toLowerCase(),
      };
      for (const key of ["url", "language"] as const) {
        if (entry[key] !== undefined) {
          string(entry[key], `${path}.${key}`);
          normalized[key] = entry[key];
        }
      }
      if (entry.local !== undefined) {
        if (typeof entry.local !== "boolean") {
          throw new Error(
            `Site profile option ${path}.local must be a boolean`,
          );
        }
        normalized.local = entry.local;
      }
      return normalized;
    });
  }
  if (value.templates !== undefined) {
    record(value.templates, "templates");
    result.templates = Object.fromEntries(
      Object.entries(value.templates).map(([name, data]) => {
        string(name, `templates.${name}`, true);
        return [name, template(data, `templates.${name}`)];
      }),
    );
  }
  if (value.formatter !== undefined)
    result.formatter = formatter(value.formatter);
  return result;
}

function sortedJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedJson(value[key]!)]),
  );
}

export function serializeSiteProfile(profile: SiteProfile): string {
  return `${JSON.stringify(sortedJson(jsonCopy(normalizeSiteProfile(profile), "profile")), null, 2)}\n`;
}

export function siteProfileFormatOptions(profile: SiteProfile): FormatOptions {
  const normalized = normalizeSiteProfile(profile);
  const options: FormatOptions = { ...normalized.formatter };
  if (options.interlanguagePrefixes === undefined) {
    options.interlanguagePrefixes = [
      ...new Set(
        (normalized.interwiki ?? [])
          .filter((entry) => entry.language !== undefined)
          .map((entry) => entry.prefix),
      ),
    ];
  }
  return options;
}

export function siteProfileTemplateDataUrl(
  apiUrl: string,
  titles: readonly string[],
  language?: string,
): URL {
  const url = new URL(validateSiteApiUrl(apiUrl, "apiUrl"));
  url.searchParams.set("action", "templatedata");
  url.searchParams.set(
    "titles",
    titles
      .map((title) => (title.includes(":") ? title : `Template:${title}`))
      .join("|"),
  );
  url.searchParams.set("redirects", "1");
  url.searchParams.set("includeMissingTitles", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  if (language !== undefined) url.searchParams.set("lang", language);
  return url;
}

export function normalizeTemplateDataResponse(
  payload: unknown,
): Record<string, SiteProfileTemplate> {
  record(payload, "response");
  if (payload.error !== undefined)
    throw new Error("MediaWiki TemplateData returned an API error");
  record(payload.pages, "pages");
  const entries: [string, SiteProfileTemplate][] = [];
  for (const [id, page] of Object.entries(payload.pages)) {
    const path = `pages.${id}`;
    record(page, path);
    if (Object.hasOwn(page, "missing") && page.missing !== false) continue;
    string(page.title, `${path}.title`, true);
    const title = page.title.slice(page.title.indexOf(":") + 1);
    string(title, `${path}.title`, true);
    const data = Object.fromEntries(
      Object.entries(page).filter(
        ([key]) => !["title", "ns", "pageid", "missing"].includes(key),
      ),
    );
    entries.push([title, template(data, path)]);
  }
  return Object.fromEntries(entries);
}

export async function loadSiteProfile(
  apiUrl: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<SiteProfile> {
  const url = new URL(validateSiteApiUrl(apiUrl, "apiUrl"));
  url.searchParams.set("action", "query");
  url.searchParams.set("meta", "siteinfo");
  url.searchParams.set(
    "siprop",
    "general|namespaces|namespacealiases|magicwords|doubleunderscores|interwikimap|extensions",
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");
  const response = await fetchImplementation(url);
  if (!response.ok) {
    throw new Error(
      `Could not fetch MediaWiki siteinfo from ${apiUrl}: HTTP ${response.status}`,
    );
  }
  const payload: unknown = await response.json();
  const formatting = normalizeSiteInfoFormattingPayload(payload);
  record(payload, "response");
  record(payload.query, "query");
  const query = payload.query;
  record(query.general, "query.general");
  const general = query.general;
  string(general.server, "query.general.server", true);
  string(general.articlepath, "query.general.articlepath", true);
  const server = general.server.startsWith("//")
    ? `${url.protocol}${general.server}`
    : general.server;
  const interwiki = Array.isArray(query.interwikimap)
    ? query.interwikimap.map((entry: unknown, index) => {
        record(entry, `query.interwikimap[${index}]`);
        return Object.fromEntries(
          ["prefix", "url", "language", "local"]
            .filter((key) => Object.hasOwn(entry, key))
            .map((key) => [
              key,
              key === "local" ? entry[key] !== false : entry[key],
            ]),
        );
      })
    : [];
  return normalizeSiteProfile({
    schemaVersion: 1,
    name: general.sitename,
    apiUrl,
    articlePath: new URL(general.articlepath, server).toString(),
    extensions: {
      templateData:
        Array.isArray(query.extensions) &&
        query.extensions.some(
          (extension: unknown) =>
            extension !== null &&
            typeof extension === "object" &&
            "name" in extension &&
            extension.name === "TemplateData",
        ),
    },
    interwiki,
    formatter: formatting,
  });
}

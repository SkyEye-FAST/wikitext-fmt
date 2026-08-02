import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  getConfig as getMagicWordConfig,
  getKeywords,
  getParserConfig as getCodeMirrorParserConfig,
  getVariants,
  type MagicWord,
  type MwConfig,
} from "@bhsd/cm-util";
import Parser, { type Config, type ConfigData } from "wikiparser-node";
import minimumConfig from "wikiparser-node/config/minimum.json" with { type: "json" };

import { createNodeParserSession } from "./parser.node.js";
import { sanitizedSiteApiUrl, validateSiteApiUrl } from "./projectConfig.js";

const require = createRequire(import.meta.url);

const DEFAULT_TIMEOUT_MILLISECONDS = 10_000;
const DEFAULT_MAX_MODULE_BYTES = 5_000_000;
const MAX_EXECUTOR_OUTPUT_BYTES = 5_000_000;

const SITEINFO_PROPERTIES = [
  "general",
  "namespaces",
  "namespacealiases",
  "magicwords",
  "interwikimap",
  "languagevariants",
  "extensiontags",
  "functionhooks",
  "variables",
  "doubleunderscores",
  "protocols",
] as const;

export interface GenerateParserConfigOptions {
  apiUrl: string;
  scriptPath?: string;
  outputPath?: string;
  timeoutMilliseconds?: number;
  maxModuleBytes?: number;
  fetchImplementation?: typeof fetch;
  executor?: ParserConfigModuleExecutor;
  now?: () => Date;
}

export interface ParserConfigModuleExecutor {
  execute(
    moduleSource: string,
    options: {
      timeoutMilliseconds: number;
      maxOutputBytes: number;
    },
  ): Promise<unknown>;
}

export interface ParserConfigProvenance {
  schemaVersion: 1;
  apiUrl: string;
  scriptPath: string;
  generatedAt: string;
  generator: "wikitext-fmt-codemirror";
  wikiparserNodeVersion: string;
  codeMirrorModuleSha256: string;
  siteInfoSha256: string;
  configSha256: string;
}

export interface GeneratedParserConfig {
  configData: ConfigData;
  provenance: ParserConfigProvenance;
  diagnostics: string[];
}

export interface ParserConfigComparison {
  equal: boolean;
  changedFields: string[];
  diff: string;
}

export interface WriteGeneratedParserConfigOptions {
  force?: boolean;
}

interface RawNamespace {
  id: number;
  name?: string;
  canonical?: string;
}

interface RawNamespaceAlias {
  id: number;
  alias: string;
}

interface RawInterwiki {
  prefix: string;
  local?: boolean;
}

interface RawSiteInfo {
  general: {
    articlepath?: string;
    server?: string;
    langconversion?: string;
  };
  namespaces: RawNamespace[];
  namespacealiases: RawNamespaceAlias[];
  magicwords: MagicWord[];
  interwikimap: RawInterwiki[];
  languagevariants: Array<{ code: string }>;
  extensiontags: string[];
  functionhooks: string[];
  variables: string[];
  doubleunderscores: unknown[];
  protocols: string[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, key: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
}

function assertPositiveInteger(value: unknown, key: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${key} must be a finite positive integer`);
  }
}

export function validateParserConfigScriptPath(
  value: unknown,
  key = "site.parserConfigGeneration.scriptPath",
): string {
  return validateSiteApiUrl(value, key);
}

export function deriveCodeMirrorScriptPath(apiUrl: string): string {
  validateSiteApiUrl(apiUrl, "site.apiUrl");
  const parsed = new URL(apiUrl);
  if (!parsed.pathname.endsWith("/api.php")) {
    throw new Error(
      "site.parserConfigGeneration.scriptPath is required when site.apiUrl does not end in /api.php",
    );
  }
  parsed.pathname = parsed.pathname.slice(0, -"api.php".length);
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function sanitizeParserConfigScriptPath(scriptPath: string): string {
  const parsed = new URL(validateParserConfigScriptPath(scriptPath));
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function normalizedScriptPath(apiUrl: string, scriptPath: string | undefined): string {
  const selected = scriptPath
    ? validateParserConfigScriptPath(scriptPath)
    : deriveCodeMirrorScriptPath(apiUrl);
  return sanitizeParserConfigScriptPath(selected);
}

function codeMirrorUrl(scriptPath: string): URL {
  const base = scriptPath.endsWith("/") ? scriptPath : `${scriptPath}/`;
  const url = new URL("load.php", base);
  url.searchParams.set("modules", "ext.CodeMirror.data|ext.CodeMirror");
  return url;
}

function sanitizedError(error: unknown, urls: readonly string[]): Error {
  let text = message(error);
  for (const url of urls) {
    try {
      const safe = sanitizedSiteApiUrl(url);
      text = text.split(url).join(safe);
    } catch {
      // The caller already validated all URLs. Never surface an untrusted value here.
    }
  }
  return new Error(text);
}

async function fetchResponse(
  url: URL,
  fetchImplementation: typeof fetch,
  timeoutMilliseconds: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetchImplementation(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Request timed out after ${timeoutMilliseconds}ms`);
    }
    throw sanitizedError(error, [url.toString()]);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(`${label} exceeds the configured maximum response size`);
    }
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(`${label} exceeds the configured maximum response size`);
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} exceeds the configured maximum response size`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function contentTypeDiagnostic(response: Response, expected: RegExp, label: string): string | undefined {
  const contentType = response.headers.get("content-type");
  if (contentType && !expected.test(contentType)) {
    return `Unexpected Content-Type for ${label}: ${contentType}`;
  }
  return undefined;
}

function requiredArray<T>(
  record: Record<string, unknown>,
  key: keyof RawSiteInfo,
): T[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`MediaWiki parser-config siteinfo is missing query.${key}`);
  }
  return value as T[];
}

function readSiteInfo(value: unknown): RawSiteInfo {
  if (!isRecord(value) || !isRecord(value.query) || !isRecord(value.query.general)) {
    throw new Error("MediaWiki parser-config siteinfo is missing query.general");
  }
  const query = value.query as Record<string, unknown>;
  const general = query.general as Record<string, unknown>;
  return {
    general: {
      ...(typeof general.articlepath === "string"
        ? { articlepath: general.articlepath }
        : {}),
      ...(typeof general.server === "string" ? { server: general.server } : {}),
      ...(typeof general.langconversion === "string"
        ? { langconversion: general.langconversion }
        : {}),
    },
    namespaces: requiredArray<RawNamespace>(query, "namespaces"),
    namespacealiases: requiredArray<RawNamespaceAlias>(query, "namespacealiases"),
    magicwords: requiredArray<MagicWord>(query, "magicwords"),
    interwikimap: requiredArray<RawInterwiki>(query, "interwikimap"),
    languagevariants: requiredArray<{ code: string }>(query, "languagevariants"),
    extensiontags: requiredArray<string>(query, "extensiontags"),
    functionhooks: requiredArray<string>(query, "functionhooks"),
    variables: requiredArray<string>(query, "variables"),
    doubleunderscores: requiredArray<unknown>(query, "doubleunderscores"),
    protocols: requiredArray<string>(query, "protocols"),
  };
}

function normalizeStringSet(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function cloneConfigData(config: ConfigData): ConfigData {
  return JSON.parse(JSON.stringify(config)) as ConfigData;
}

function isCodeMirrorConfig(value: unknown): value is MwConfig {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.tags) &&
    isRecord(value.tagModes) &&
    typeof value.urlProtocols === "string" &&
    Array.isArray(value.functionSynonyms) &&
    value.functionSynonyms.length === 2 &&
    isRecord(value.functionSynonyms[0]) &&
    isRecord(value.functionSynonyms[1]) &&
    Array.isArray(value.doubleUnderscore) &&
    value.doubleUnderscore.length === 2 &&
    isRecord(value.doubleUnderscore[0]) &&
    isRecord(value.doubleUnderscore[1])
  );
}

function namespaceNames(siteInfo: RawSiteInfo): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const namespace of siteInfo.namespaces) {
    if (!Number.isInteger(namespace.id)) continue;
    const name = namespace.name ?? "";
    const canonical = namespace.canonical ?? "";
    result.push([String(namespace.id), name]);
    if (canonical !== name) result.push([String(namespace.id), canonical]);
  }
  return result;
}

function buildConfigData(
  codeMirrorConfig: MwConfig,
  siteInfo: RawSiteInfo,
): { configData: ConfigData; diagnostics: string[] } {
  const namespaceEntries = namespaceNames(siteInfo);
  if (!namespaceEntries.some(([id, name]) => id === "0" && name === "")) {
    throw new Error("MediaWiki parser-config siteinfo must include main namespace 0");
  }
  const namespaces = Object.fromEntries(namespaceEntries);
  const nsidEntries: Array<[string, number]> = namespaceEntries.map(([id, name]) => [
    name.toLocaleLowerCase(),
    Number(id),
  ]);
  for (const alias of siteInfo.namespacealiases) {
    if (!Number.isInteger(alias.id) || typeof alias.alias !== "string") continue;
    nsidEntries.push([alias.alias.toLocaleLowerCase(), alias.id]);
  }
  const nsid: Record<string, number> = {};
  for (const [name, id] of nsidEntries) {
    const normalized = name.trim().replaceAll("_", " ").toLocaleLowerCase();
    if (!normalized && id !== 0) continue;
    if (nsid[normalized] !== undefined && nsid[normalized] !== id) {
      throw new Error(
        `MediaWiki parser-config namespace alias conflict for ${normalized}: ${nsid[normalized]} and ${id}`,
      );
    }
    nsid[normalized] = id;
  }
  if (nsid[""] !== 0) {
    throw new Error("MediaWiki parser-config siteinfo must map the main namespace to 0");
  }

  const base = getCodeMirrorParserConfig(
    cloneConfigData(minimumConfig as unknown as ConfigData),
    codeMirrorConfig,
  );
  const fallbackKeywords =
    codeMirrorConfig.imageKeywords && codeMirrorConfig.redirection
      ? {}
      : getKeywords(siteInfo.magicwords);
  const parserFunction = base.parserFunction;
  parserFunction[0] = {
    ...parserFunction[0],
    ...getMagicWordConfig(siteInfo.magicwords, ({ name }) => name === "msgnw"),
  };
  parserFunction[2] = siteInfo.magicwords
    .filter(({ name }) => name === "msg" || name === "raw")
    .flatMap(({ aliases }) => aliases)
    .map((alias) => alias.replace(/:$/u, "").toLocaleLowerCase());
  parserFunction[3] = siteInfo.magicwords
    .filter(({ name }) => name === "subst" || name === "safesubst")
    .flatMap(({ aliases }) => aliases)
    .map((alias) => alias.replace(/:$/u, "").toLocaleLowerCase());

  const localNamespaces = new Set(Object.keys(nsid));
  const interwiki = normalizeStringSet(
    siteInfo.interwikimap
      .filter((entry) => !entry.local && typeof entry.prefix === "string")
      .map((entry) => entry.prefix)
      .filter(
        (prefix) =>
          !localNamespaces.has(
            prefix.trim().replaceAll("_", " ").toLocaleLowerCase(),
          ),
      ),
  );
  const extensionTags = normalizeStringSet([
    ...Object.keys(codeMirrorConfig.tags),
    ...siteInfo.extensiontags,
  ]);
  const configData: ConfigData = {
    ...base,
    ...fallbackKeywords,
    ext: extensionTags,
    functionHook: normalizeStringSet(
      codeMirrorConfig.functionHooks ?? [...siteInfo.functionhooks, "msgnw"],
    ).map((entry) => entry.toLocaleLowerCase()),
    variable: normalizeStringSet(
      codeMirrorConfig.variableIDs ?? [...siteInfo.variables, "="],
    ).map((entry) => entry.toLocaleLowerCase()),
    variants: siteInfo.general.langconversion
      ? normalizeStringSet(getVariants(siteInfo.languagevariants))
      : [],
    namespaces,
    nsid,
    interwiki,
    ...(siteInfo.general.articlepath
      ? { articlePath: siteInfo.general.articlepath }
      : {}),
    ...(siteInfo.general.server ? { server: siteInfo.general.server } : {}),
  };
  if ("#choose" in configData.parserFunction[0]) {
    delete configData.parserFunction[0].choose;
    configData.variable = configData.variable.filter((entry) => entry !== "choose");
  }
  return {
    configData,
    diagnostics: [
      "Parser configuration sources: CodeMirror module for parser syntax; MediaWiki siteinfo for namespaces, aliases, interwiki, variants, extension tags, hooks, variables, and provenance.",
    ],
  };
}

function assertStringArray(value: unknown, key: string): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)
  ) {
    throw new Error(`Generated parser configuration ${key} must be an array of non-empty strings`);
  }
}

function validateConfigShape(configData: ConfigData): void {
  const record = configData as unknown as Record<string, unknown>;
  for (const key of [
    "ext",
    "functionHook",
    "variable",
    "interwiki",
    "redirection",
    "variants",
  ]) {
    assertStringArray(record[key], key);
  }
  for (const key of ["img", "namespaces", "nsid"] as const) {
    if (!isRecord(record[key])) {
      throw new Error(`Generated parser configuration ${key} must be an object`);
    }
  }
  if (typeof record.protocol !== "string" || record.protocol.length === 0) {
    throw new Error("Generated parser configuration protocol must be a non-empty string");
  }
  if (
    record.protocol.split("|").some(
      (entry) => !entry || !/^[A-Za-z][A-Za-z0-9+.-]*:(?:\/\/)?$/u.test(entry),
    )
  ) {
    throw new Error("Generated parser configuration protocol contains an invalid parser protocol pattern");
  }
  if (!Array.isArray(record.parserFunction) || record.parserFunction.length !== 4) {
    throw new Error("Generated parser configuration parserFunction must have four entries");
  }
  if (!Array.isArray(record.doubleUnderscore) || record.doubleUnderscore.length !== 4) {
    throw new Error("Generated parser configuration doubleUnderscore must have four entries");
  }
  const nsid = record.nsid as Record<string, unknown>;
  if (nsid[""] !== 0) {
    throw new Error("Generated parser configuration nsid must map the main namespace to 0");
  }
  for (const [name, id] of Object.entries(nsid)) {
    if (!Number.isInteger(id)) {
      throw new Error(`Generated parser configuration nsid.${name} must be an integer`);
    }
  }
}

function smokeTest(config: Config): void {
  const session = createNodeParserSession(config);
  for (const source of [
    "{{Template|a=1}}",
    "[[Category:Example]]",
    "[[File:Example.png|thumb]]",
    '<ref name="a" />',
    "{| class=\"wikitable\"\n|-\n| A || B\n|}",
  ]) {
    if (!session.isRoundTripSafe(source)) {
      throw new Error("Generated parser configuration failed its parser round-trip smoke test");
    }
  }
}

export function validateGeneratedParserConfig(configData: ConfigData): ConfigData {
  validateConfigShape(configData);
  let config: Config;
  try {
    config = Parser.getConfig(cloneConfigData(configData));
  } catch (error) {
    throw new Error(`Generated parser configuration was rejected by wikiparser-node: ${message(error)}`);
  }
  smokeTest(config);
  return configData;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareKeys)
      .map((key) => [key, stableValue(value[key])]),
  );
}

function normalizedConfigData(configData: ConfigData): ConfigData {
  const clone = cloneConfigData(configData);
  return stableValue({
    ...clone,
    ext: normalizeStringSet(clone.ext),
    functionHook: normalizeStringSet(clone.functionHook),
    variable: normalizeStringSet(clone.variable),
    interwiki: normalizeStringSet(clone.interwiki),
    variants: normalizeStringSet(clone.variants),
    redirection: normalizeStringSet(clone.redirection),
  }) as ConfigData;
}

export function serializeGeneratedParserConfig(configData: ConfigData): string {
  validateGeneratedParserConfig(configData);
  return `${JSON.stringify(normalizedConfigData(configData), null, 2)}\n`;
}

function parserConfigVersion(): string {
  const metadata = require("wikiparser-node/package.json") as { version?: unknown };
  if (typeof metadata.version !== "string") {
    throw new Error("Could not determine the installed wikiparser-node version");
  }
  return metadata.version;
}

const executorRunner = `"use strict";
let config;
function execute(files) {
  const data = Object.entries(files).find(([name]) => name.endsWith(".data.js"));
  if (!data || typeof data[1] !== "function") throw new Error("CodeMirror data module was not present");
  data[1]();
}
globalThis.mw = {
  loader: {
    done: false,
    impl(callback) { execute(callback()[1].files); },
    implement(name, callback) {
      if (typeof callback === "object") execute(callback.files);
      else if (!this.done) callback();
      if (name.startsWith("ext.CodeMirror.data")) this.done = true;
    },
    state() {},
  },
  config: { set(value) { config = value.extCodeMirrorConfig; } },
};
require(process.argv[2]);
if (!config) throw new Error("CodeMirror did not provide extCodeMirrorConfig");
process.stdout.write(JSON.stringify(config));
`;

function executeChildProcess(
  modulePath: string,
  runnerPath: string,
  directory: string,
  timeoutMilliseconds: number,
  maxOutputBytes: number,
): Promise<string> {
  return new Promise((resolveResult, reject) => {
    const permissionFlag = process.allowedNodeEnvironmentFlags.has("--permission")
      ? "--permission"
      : "--experimental-permission";
    const child = spawn(
      process.execPath,
      [
        permissionFlag,
        `--allow-fs-read=${directory}`,
        "--disable-warning=ExperimentalWarning",
        runnerPath,
        modulePath,
      ],
      {
        cwd: directory,
        env: {},
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let timedOut = false;
    let oversized = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMilliseconds);
    const append = (chunks: Buffer[], chunk: Buffer, isStdout: boolean) => {
      if (isStdout) stdoutSize += chunk.byteLength;
      else stderrSize += chunk.byteLength;
      if (stdoutSize > maxOutputBytes || stderrSize > maxOutputBytes) {
        oversized = true;
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk, true));
    child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk, false));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`CodeMirror module execution timed out after ${timeoutMilliseconds}ms`));
        return;
      }
      if (oversized) {
        reject(new Error("CodeMirror module execution exceeded the configured output limit"));
        return;
      }
      if (code !== 0) {
        reject(new Error("CodeMirror module execution failed"));
        return;
      }
      resolveResult(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

export const isolatedCodeMirrorModuleExecutor: ParserConfigModuleExecutor = {
  async execute(moduleSource, options) {
    const directory = await mkdtemp(join(tmpdir(), "wikitext-fmt-codemirror-"));
    try {
      const modulePath = join(directory, "module.cjs");
      const runnerPath = join(directory, "runner.cjs");
      await writeFile(modulePath, moduleSource, { encoding: "utf8", mode: 0o600 });
      await writeFile(runnerPath, executorRunner, { encoding: "utf8", mode: 0o600 });
      const output = await executeChildProcess(
        modulePath,
        runnerPath,
        directory,
        options.timeoutMilliseconds,
        options.maxOutputBytes,
      );
      try {
        return JSON.parse(output) as unknown;
      } catch {
        throw new Error("CodeMirror module execution produced invalid JSON");
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
};

export async function generateSiteParserConfig(
  options: GenerateParserConfigOptions,
): Promise<GeneratedParserConfig> {
  const apiUrl = validateSiteApiUrl(options.apiUrl, "apiUrl");
  const timeoutMilliseconds =
    options.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS;
  const maxModuleBytes = options.maxModuleBytes ?? DEFAULT_MAX_MODULE_BYTES;
  assertPositiveInteger(timeoutMilliseconds, "timeoutMilliseconds");
  assertPositiveInteger(maxModuleBytes, "maxModuleBytes");
  if (options.outputPath !== undefined) {
    assertNonEmptyString(options.outputPath, "outputPath");
  }
  const scriptPath = normalizedScriptPath(apiUrl, options.scriptPath);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const diagnostics: string[] = [];
  const moduleUrl = codeMirrorUrl(scriptPath);
  let moduleResponse: Response;
  try {
    moduleResponse = await fetchResponse(moduleUrl, fetchImplementation, timeoutMilliseconds);
  } catch (error) {
    throw sanitizedError(error, [apiUrl, scriptPath, moduleUrl.toString()]);
  }
  const contentType = contentTypeDiagnostic(
    moduleResponse,
    /(?:java|ecma)script|text\/plain/iu,
    "CodeMirror module",
  );
  if (contentType) diagnostics.push(contentType);
  const moduleBytes = await readBoundedResponse(
    moduleResponse,
    maxModuleBytes,
    "CodeMirror module",
  );
  const moduleSource = new TextDecoder("utf-8", { fatal: true }).decode(moduleBytes);
  let codeMirrorConfig: unknown;
  try {
    codeMirrorConfig = await (options.executor ?? isolatedCodeMirrorModuleExecutor).execute(
      moduleSource,
      { timeoutMilliseconds, maxOutputBytes: MAX_EXECUTOR_OUTPUT_BYTES },
    );
  } catch (error) {
    throw sanitizedError(error, [apiUrl, scriptPath]);
  }
  if (!isCodeMirrorConfig(codeMirrorConfig)) {
    throw new Error("CodeMirror module did not provide a valid extCodeMirrorConfig");
  }

  const siteInfoUrl = new URL(apiUrl);
  siteInfoUrl.search = "";
  siteInfoUrl.hash = "";
  siteInfoUrl.searchParams.set("action", "query");
  siteInfoUrl.searchParams.set("meta", "siteinfo");
  siteInfoUrl.searchParams.set("siprop", SITEINFO_PROPERTIES.join("|"));
  siteInfoUrl.searchParams.set("format", "json");
  siteInfoUrl.searchParams.set("formatversion", "2");
  let siteInfoResponse: Response;
  try {
    siteInfoResponse = await fetchResponse(
      siteInfoUrl,
      fetchImplementation,
      timeoutMilliseconds,
    );
  } catch (error) {
    throw sanitizedError(error, [apiUrl, scriptPath, siteInfoUrl.toString()]);
  }
  const siteInfoContentType = contentTypeDiagnostic(
    siteInfoResponse,
    /application\/json|\+json/iu,
    "MediaWiki siteinfo",
  );
  if (siteInfoContentType) diagnostics.push(siteInfoContentType);
  const siteInfoBytes = await readBoundedResponse(
    siteInfoResponse,
    maxModuleBytes,
    "MediaWiki siteinfo",
  );
  let rawSiteInfo: unknown;
  try {
    rawSiteInfo = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(siteInfoBytes)) as unknown;
  } catch {
    throw new Error("MediaWiki parser-config siteinfo response was not valid JSON");
  }
  const built = buildConfigData(codeMirrorConfig, readSiteInfo(rawSiteInfo));
  validateGeneratedParserConfig(built.configData);
  const configText = serializeGeneratedParserConfig(built.configData);
  const provenance: ParserConfigProvenance = {
    schemaVersion: 1,
    apiUrl: sanitizedSiteApiUrl(apiUrl),
    scriptPath,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    generator: "wikitext-fmt-codemirror",
    wikiparserNodeVersion: parserConfigVersion(),
    codeMirrorModuleSha256: sha256(moduleBytes),
    siteInfoSha256: sha256(JSON.stringify(stableValue(rawSiteInfo))),
    configSha256: sha256(configText),
  };
  return {
    configData: normalizedConfigData(built.configData),
    provenance,
    diagnostics: [...diagnostics, ...built.diagnostics],
  };
}

export function serializeParserConfigProvenance(
  provenance: ParserConfigProvenance,
): string {
  return `${JSON.stringify(stableValue(provenance), null, 2)}\n`;
}

function semanticValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => semanticValue(entry));
    if (
      key &&
      ["ext", "functionHook", "variable", "interwiki", "variants"].includes(
        key,
      )
    ) {
      return [...new Set(normalized.map((entry) => JSON.stringify(entry)))].sort();
    }
    return normalized;
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(compareKeys)
      .map((entry) => [entry, semanticValue(value[entry], entry)]),
  );
}

export function compareParserConfigs(
  current: ConfigData,
  generated: ConfigData,
): ParserConfigComparison {
  validateGeneratedParserConfig(current);
  validateGeneratedParserConfig(generated);
  const left = semanticValue(current) as Record<string, unknown>;
  const right = semanticValue(generated) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareKeys);
  const changedFields = keys.filter(
    (key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]),
  );
  const diff = changedFields
    .map(
      (key) =>
        `@@ ${key} @@\n- ${JSON.stringify(left[key], null, 2)}\n+ ${JSON.stringify(right[key], null, 2)}`,
    )
    .join("\n");
  return { equal: changedFields.length === 0, changedFields, diff };
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeGeneratedParserConfig(
  outputPath: string,
  generated: GeneratedParserConfig,
  options: WriteGeneratedParserConfigOptions = {},
): Promise<{ outputPath: string; provenancePath: string }> {
  assertNonEmptyString(outputPath, "outputPath");
  const resolvedOutputPath = resolve(outputPath);
  const provenancePath = `${resolvedOutputPath}.meta.json`;
  if (
    !options.force &&
    ((await exists(resolvedOutputPath)) || (await exists(provenancePath)))
  ) {
    throw new Error(
      `Parser configuration already exists at ${resolvedOutputPath}; use --force-parser-config to overwrite it`,
    );
  }
  const configText = serializeGeneratedParserConfig(generated.configData);
  const expectedHash = sha256(configText);
  if (generated.provenance.configSha256 !== expectedHash) {
    throw new Error("Generated parser configuration provenance hash does not match ConfigData");
  }
  await writeAtomically(provenancePath, serializeParserConfigProvenance(generated.provenance));
  await writeAtomically(resolvedOutputPath, configText);
  return { outputPath: resolvedOutputPath, provenancePath };
}

export function parserConfigGenerationDefaults(): {
  method: "codemirror";
  timeoutMilliseconds: number;
  maxModuleBytes: number;
} {
  return {
    method: "codemirror",
    timeoutMilliseconds: DEFAULT_TIMEOUT_MILLISECONDS,
    maxModuleBytes: DEFAULT_MAX_MODULE_BYTES,
  };
}

export async function readParserConfigFile(path: string): Promise<ConfigData> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ConfigData;
  } catch (error) {
    throw new Error(`Could not read parser configuration ${path}: ${message(error)}`);
  }
}

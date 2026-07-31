import {
  discoverConfig,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
  type FormatDetailedResult,
  type FormatFailure,
  type FormatOptions,
  loadConfig,
} from "wikitext-fmt";
import { dirname, isAbsolute, resolve } from "node:path";
import { vscodeFormatOptionMetadata } from "./optionMetadata.js";

export interface ConfigLike {
  get<T>(key: string, defaultValue: T): T;
  inspect?<T>(key: string): ConfigInspection<T> | undefined;
}

export interface ConfigInspection<T> {
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
  globalLanguageValue?: T;
  workspaceLanguageValue?: T;
  workspaceFolderLanguageValue?: T;
}

export interface EditorFormatSettings {
  safe: boolean;
  options: FormatOptions;
  explicitOptions: FormatOptions;
  configOptions: FormatOptions;
}

export interface EditorConfigLoadOptions {
  enabled: boolean;
  configPath?: string | null;
  documentPath?: string;
  workspaceFolderPath?: string;
}

export interface LoadedEditorConfig {
  options: FormatOptions;
  configOptions: FormatOptions;
  path?: string;
}

export type EditorSettingsResolution =
  | {
      kind: "settings";
      settings: EditorFormatSettings;
      configPath?: string;
    }
  | { kind: "warning"; warning: string; configPath?: string };

export interface FormatterApi {
  formatWikitextDetailedResult(
    source: string,
    options?: FormatOptions,
  ): FormatDetailedResult;
  formatWikitextSafeDetailed(
    source: string,
    options?: FormatOptions,
  ): FormatDetailedResult;
}

interface EditorFormattingResultBase {
  formatted: string;
  changed: boolean;
  details: FormatDetailedResult;
}

export type EditorFormattingResult =
  | (EditorFormattingResultBase & { kind: "changed" })
  | (EditorFormattingResultBase & { kind: "unchanged" })
  | (EditorFormattingResultBase & {
      kind: "failed";
      failure: FormatFailure;
      warning?: string;
    })
  | (EditorFormattingResultBase & { kind: "warning"; warning: string });

export type EditorDocumentFormattingResult =
  | {
      kind: "settings-warning";
      formatted: string;
      changed: false;
      warning: string;
      configPath?: string;
    }
  | (EditorFormattingResult & {
      settings: EditorFormatSettings;
      configPath?: string;
    });

const defaultFormatter: FormatterApi = {
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
};

class EditorConfigLoadError extends Error {
  constructor(
    message: string,
    readonly configPath?: string,
  ) {
    super(message);
    this.name = "EditorConfigLoadError";
  }
}

function hasConfiguredSetting(config: ConfigLike, key: string): boolean {
  const inspection = config.inspect?.(key);
  if (!inspection) return true;
  return (
    inspection.globalValue !== undefined ||
    inspection.workspaceValue !== undefined ||
    inspection.workspaceFolderValue !== undefined ||
    inspection.globalLanguageValue !== undefined ||
    inspection.workspaceLanguageValue !== undefined ||
    inspection.workspaceFolderLanguageValue !== undefined
  );
}

export function buildExplicitFormatOptions(config: ConfigLike): FormatOptions {
  const options: FormatOptions = {};
  const values = options as Record<string, unknown>;
  for (const metadata of vscodeFormatOptionMetadata) {
    if (!hasConfiguredSetting(config, metadata.name)) continue;
    values[metadata.name] = config.get(
      metadata.name,
      metadata.defaultValue,
    );
  }
  return options;
}

export function buildFormatOptions(
  config: ConfigLike,
  baseOptions: FormatOptions = {},
): FormatOptions {
  return { ...baseOptions, ...buildExplicitFormatOptions(config) };
}

export function buildEditorSettings(
  config: ConfigLike,
  baseOptions: FormatOptions = {},
  configOptions: FormatOptions = baseOptions,
): EditorFormatSettings {
  const explicitOptions = buildExplicitFormatOptions(config);
  return {
    safe: config.get<boolean>("safe", true),
    options: { ...baseOptions, ...explicitOptions },
    explicitOptions,
    configOptions: { ...configOptions },
  };
}
export function buildEditorConfigLoadOptions(
  config: ConfigLike,
): Pick<EditorConfigLoadOptions, "enabled" | "configPath"> {
  return {
    enabled: config.get<boolean>("config.enabled", true),
    configPath: config.get<string | null>("config.path", null),
  };
}

function isPathLikeParserConfig(value: string): boolean {
  return /[\\/]/u.test(value) || /\.json$/iu.test(value);
}

export function resolveConfigParserConfig(
  options: FormatOptions,
  configPath: string,
): FormatOptions {
  const parserConfig = options.parserConfig;
  if (
    !parserConfig ||
    isAbsolute(parserConfig) ||
    !isPathLikeParserConfig(parserConfig)
  ) {
    return { ...options };
  }
  return {
    ...options,
    parserConfig: resolve(dirname(configPath), parserConfig),
  };
}

async function loadEditorConfigFile(path: string): Promise<LoadedEditorConfig> {
  try {
    const configOptions = await loadConfig(path);
    return {
      options: resolveConfigParserConfig(configOptions, path),
      configOptions,
      path,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EditorConfigLoadError(message, path);
  }
}

export async function loadEditorConfigOptions(
  options: EditorConfigLoadOptions,
): Promise<LoadedEditorConfig> {
  if (!options.enabled) return { options: {}, configOptions: {} };

  if (options.configPath) {
    const base =
      options.workspaceFolderPath ??
      (options.documentPath ? dirname(options.documentPath) : process.cwd());
    const path = isAbsolute(options.configPath)
      ? options.configPath
      : resolve(base, options.configPath);
    return loadEditorConfigFile(path);
  }

  if (!options.documentPath) return { options: {}, configOptions: {} };

  const path = await discoverConfig(dirname(options.documentPath));
  if (!path) return { options: {}, configOptions: {} };
  return loadEditorConfigFile(path);
}

export async function resolveEditorSettings(
  config: ConfigLike,
  configLoadOptions: EditorConfigLoadOptions,
): Promise<EditorSettingsResolution> {
  try {
    const loaded = await loadEditorConfigOptions(configLoadOptions);
    return {
      kind: "settings",
      settings: buildEditorSettings(
        config,
        loaded.options,
        loaded.configOptions,
      ),
      configPath: loaded.path,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: "warning",
      warning: message,
      configPath:
        error instanceof EditorConfigLoadError
          ? error.configPath
          : undefined,
    };
  }
}

export function formatTextForEditor(
  source: string,
  settings: EditorFormatSettings,
  formatter: FormatterApi = defaultFormatter,
): FormatDetailedResult {
  return settings.safe
    ? formatter.formatWikitextSafeDetailed(source, settings.options)
    : formatter.formatWikitextDetailedResult(source, settings.options);
}

export function getEditorFormattingResult(
  source: string,
  settings: EditorFormatSettings,
  formatter: FormatterApi = defaultFormatter,
): EditorFormattingResult {
  const details = formatTextForEditor(source, settings, formatter);
  const base = {
    formatted: details.formatted,
    changed: details.formatted !== source,
    details,
  };

  if (details.failure) {
    return {
      ...base,
      kind: "failed",
      failure: details.failure,
      ...(details.warning ? { warning: details.warning } : {}),
    };
  }

  if (details.warning) {
    return {
      ...base,
      kind: "warning",
      warning: details.warning,
    };
  }

  return details.formatted === source
    ? { ...base, kind: "unchanged" }
    : { ...base, kind: "changed" };
}

export function getEditorDocumentFormattingResult(
  source: string,
  resolution: EditorSettingsResolution,
  formatter: FormatterApi = defaultFormatter,
): EditorDocumentFormattingResult {
  if (resolution.kind === "warning") {
    return {
      kind: "settings-warning",
      formatted: source,
      changed: false,
      warning: resolution.warning,
      configPath: resolution.configPath,
    };
  }
  return {
    ...getEditorFormattingResult(source, resolution.settings, formatter),
    settings: resolution.settings,
    configPath: resolution.configPath,
  };
}

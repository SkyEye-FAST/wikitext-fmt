import {
  discoverConfig,
  formatWikitext,
  formatWikitextSafe,
  type FormatLevel,
  type FormatOptions,
  type FormatResult,
  type HtmlVoidTagStyle,
  loadConfig,
} from "wikitext-fmt";
import { dirname, isAbsolute, resolve } from "node:path";

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
}

export interface EditorConfigLoadOptions {
  enabled: boolean;
  configPath?: string | null;
  documentPath?: string;
  workspaceFolderPath?: string;
}

export interface LoadedEditorConfig {
  options: FormatOptions;
  path?: string;
}

export type EditorSettingsResolution =
  | { kind: "settings"; settings: EditorFormatSettings; configPath?: string }
  | { kind: "warning"; warning: string };

export interface FormatterApi {
  formatWikitext(source: string, options?: FormatOptions): string;
  formatWikitextSafe(source: string, options?: FormatOptions): FormatResult;
}

export type EditorFormattingResult =
  | { kind: "changed"; formatted: string }
  | { kind: "unchanged"; formatted: string }
  | { kind: "warning"; formatted: string; warning: string };

const defaultFormatter: FormatterApi = {
  formatWikitext,
  formatWikitextSafe,
};

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

function applySetting<T>(
  options: FormatOptions,
  config: ConfigLike,
  key: keyof FormatOptions,
  defaultValue: T,
): void {
  if (hasConfiguredSetting(config, key)) {
    (options as Record<string, unknown>)[key] = config.get<T>(
      key,
      defaultValue,
    );
  }
}

export function buildFormatOptions(
  config: ConfigLike,
  baseOptions: FormatOptions = {},
): FormatOptions {
  const options: FormatOptions = { ...baseOptions };

  applySetting<FormatLevel>(options, config, "level", "normal");
  applySetting<HtmlVoidTagStyle>(options, config, "htmlVoidTagStyle", "html5");
  applySetting<boolean>(options, config, "formatTables", false);
  applySetting<boolean>(options, config, "formatReferences", false);
  applySetting<boolean>(options, config, "formatSectionSpacing", false);
  applySetting<boolean>(options, config, "formatTemplateParameters", false);

  return options;
}

export function buildEditorSettings(
  config: ConfigLike,
  baseOptions: FormatOptions = {},
): EditorFormatSettings {
  return {
    safe: config.get<boolean>("safe", true),
    options: buildFormatOptions(config, baseOptions),
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

export async function loadEditorConfigOptions(
  options: EditorConfigLoadOptions,
): Promise<LoadedEditorConfig> {
  if (!options.enabled) return { options: {} };

  if (options.configPath) {
    const base =
      options.workspaceFolderPath ??
      (options.documentPath ? dirname(options.documentPath) : process.cwd());
    const path = isAbsolute(options.configPath)
      ? options.configPath
      : resolve(base, options.configPath);
    return { options: await loadConfig(path), path };
  }

  if (!options.documentPath) return { options: {} };

  const path = await discoverConfig(dirname(options.documentPath));
  if (!path) return { options: {} };
  return { options: await loadConfig(path), path };
}

export async function resolveEditorSettings(
  config: ConfigLike,
  configLoadOptions: EditorConfigLoadOptions,
): Promise<EditorSettingsResolution> {
  try {
    const loaded = await loadEditorConfigOptions(configLoadOptions);
    return {
      kind: "settings",
      settings: buildEditorSettings(config, loaded.options),
      configPath: loaded.path,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: "warning", warning: message };
  }
}

export function formatTextForEditor(
  source: string,
  settings: EditorFormatSettings,
  formatter: FormatterApi = defaultFormatter,
): FormatResult {
  if (settings.safe) {
    return formatter.formatWikitextSafe(source, settings.options);
  }

  return {
    formatted: formatter.formatWikitext(source, settings.options),
  };
}

export function getEditorFormattingResult(
  source: string,
  settings: EditorFormatSettings,
  formatter: FormatterApi = defaultFormatter,
): EditorFormattingResult {
  const result = formatTextForEditor(source, settings, formatter);

  if (result.warning) {
    return {
      kind: "warning",
      formatted: result.formatted,
      warning: result.warning,
    };
  }

  if (result.formatted === source) {
    return {
      kind: "unchanged",
      formatted: result.formatted,
    };
  }

  return {
    kind: "changed",
    formatted: result.formatted,
  };
}

import {
  formatWikitext,
  formatWikitextSafe,
  type FormatLevel,
  type FormatOptions,
  type FormatResult,
  type HtmlVoidTagStyle,
} from "wikitext-fmt";

export interface ConfigLike {
  get<T>(key: string, defaultValue: T): T;
}

export interface EditorFormatSettings {
  safe: boolean;
  options: FormatOptions;
}

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

export function buildFormatOptions(config: ConfigLike): FormatOptions {
  return {
    level: config.get<FormatLevel>("level", "normal"),
    htmlVoidTagStyle: config.get<HtmlVoidTagStyle>("htmlVoidTagStyle", "html5"),
    formatTables: config.get<boolean>("formatTables", false),
    formatReferences: config.get<boolean>("formatReferences", false),
    formatSectionSpacing: config.get<boolean>("formatSectionSpacing", false),
    formatTemplateParameters: config.get<boolean>(
      "formatTemplateParameters",
      false,
    ),
  };
}

export function buildEditorSettings(config: ConfigLike): EditorFormatSettings {
  return {
    safe: config.get<boolean>("safe", true),
    options: buildFormatOptions(config),
  };
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

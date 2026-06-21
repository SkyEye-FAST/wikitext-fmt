export type FormatLevel = "safe" | "normal" | "experimental";
export type HtmlVoidTagStyle = "html5" | "xhtml" | "preserve";

export interface FormatOptions {
  parserConfig?: string;
  lineWidth?: number;
  formatHeadings?: boolean;
  formatTemplates?: boolean;
  formatCategories?: boolean;
  formatTables?: boolean;
  normalizeBlankLines?: boolean;
  level?: FormatLevel;
  htmlVoidTagStyle?: HtmlVoidTagStyle;
}

export interface ResolvedFormatOptions {
  parserConfig: string;
  lineWidth: number;
  formatHeadings: boolean;
  formatTemplates: boolean;
  formatCategories: boolean;
  formatTables: boolean;
  normalizeBlankLines: boolean;
  level: FormatLevel;
  htmlVoidTagStyle: HtmlVoidTagStyle;
}

export const defaultOptions: Readonly<ResolvedFormatOptions> = {
  parserConfig: "mediawiki",
  lineWidth: 120,
  formatHeadings: true,
  formatTemplates: true,
  formatCategories: true,
  formatTables: false,
  normalizeBlankLines: true,
  level: "normal",
  htmlVoidTagStyle: "html5",
};

export function resolveOptions(options: FormatOptions = {}): ResolvedFormatOptions {
  return { ...defaultOptions, ...options };
}

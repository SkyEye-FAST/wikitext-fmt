export type FormatLevel = "safe" | "normal" | "experimental";
export type HtmlVoidTagStyle = "html5" | "xhtml" | "preserve";
export type TableCellSeparatorStyle = "auto" | "split" | "preserve";

export interface FormatOptions {
  parserConfig?: string;
  lineWidth?: number;
  formatHeadings?: boolean;
  formatTemplates?: boolean;
  formatCategories?: boolean;
  formatLists?: boolean;
  formatTables?: boolean;
  tableCellSeparatorStyle?: TableCellSeparatorStyle;
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
  formatLists: boolean;
  formatTables: boolean;
  tableCellSeparatorStyle: TableCellSeparatorStyle;
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
  formatLists: true,
  formatTables: false,
  tableCellSeparatorStyle: "auto",
  normalizeBlankLines: true,
  level: "normal",
  htmlVoidTagStyle: "html5",
};

export function resolveOptions(options: FormatOptions = {}): ResolvedFormatOptions {
  return { ...defaultOptions, ...options };
}

export type FormatLevel = "safe" | "normal" | "experimental";
export type HtmlVoidTagStyle = "html5" | "xhtml" | "preserve";
export type TableCellSeparatorStyle = "auto" | "split" | "preserve";
export type BehaviorSwitchPlacement = "preserve" | "footer";
export type LocalizationSource = "builtin" | "siteinfo" | "custom";
export type LocalizedSyntaxStyle = "preserve" | "canonical-english";

export interface LocalizationAliases {
  categoryNamespaces?: string[];
  defaultsortMagicWords?: string[];
  behaviorSwitches?: Record<string, string[]>;
}

export interface FormatOptions {
  parserConfig?: string;
  lineWidth?: number;
  formatHeadings?: boolean;
  formatTemplates?: boolean;
  formatCategories?: boolean;
  formatLists?: boolean;
  formatBehaviorSwitches?: boolean;
  behaviorSwitchPlacement?: BehaviorSwitchPlacement;
  localizationSource?: LocalizationSource;
  localizedSyntaxStyle?: LocalizedSyntaxStyle;
  localizationAliases?: LocalizationAliases;
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
  formatBehaviorSwitches: boolean;
  behaviorSwitchPlacement: BehaviorSwitchPlacement;
  localizationSource: LocalizationSource;
  localizedSyntaxStyle: LocalizedSyntaxStyle;
  localizationAliases: LocalizationAliases;
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
  formatBehaviorSwitches: true,
  behaviorSwitchPlacement: "preserve",
  localizationSource: "builtin",
  localizedSyntaxStyle: "preserve",
  localizationAliases: {},
  formatTables: false,
  tableCellSeparatorStyle: "auto",
  normalizeBlankLines: true,
  level: "normal",
  htmlVoidTagStyle: "html5",
};

export function resolveOptions(
  options: FormatOptions = {},
): ResolvedFormatOptions {
  return { ...defaultOptions, ...options };
}

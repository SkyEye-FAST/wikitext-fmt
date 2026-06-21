export type FormatLevel = "safe" | "normal" | "experimental";
export type HtmlVoidTagStyle = "html5" | "xhtml" | "preserve";
export type TableCellSeparatorStyle = "auto" | "split" | "preserve";
export type BehaviorSwitchPlacement = "preserve" | "footer";
export type InterlanguagePlacement = "preserve" | "footer";
export type LocalizationSource = "builtin" | "siteinfo" | "custom";
export type LocalizedSyntaxStyle = "preserve" | "canonical-english";

export interface LocalizationAliases {
  categoryNamespaces?: string[];
  fileNamespaces?: string[];
  defaultsortMagicWords?: string[];
  redirectMagicWords?: string[];
  imageOptionAliases?: Record<string, string[]>;
  behaviorSwitches?: Record<string, string[]>;
}

export interface FormatOptions {
  parserConfig?: string;
  lineWidth?: number;
  formatHeadings?: boolean;
  formatTemplates?: boolean;
  formatTemplateParameters?: boolean;
  formatCategories?: boolean;
  formatLists?: boolean;
  formatFileLinks?: boolean;
  formatReferences?: boolean;
  formatInterlanguageLinks?: boolean;
  interlanguagePlacement?: InterlanguagePlacement;
  interlanguagePrefixes?: string[];
  formatSectionSpacing?: boolean;
  formatBehaviorSwitches?: boolean;
  formatRedirects?: boolean;
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
  formatTemplateParameters: boolean;
  formatCategories: boolean;
  formatLists: boolean;
  formatFileLinks: boolean;
  formatReferences: boolean;
  formatInterlanguageLinks: boolean;
  interlanguagePlacement: InterlanguagePlacement;
  interlanguagePrefixes: string[];
  formatSectionSpacing: boolean;
  formatBehaviorSwitches: boolean;
  formatRedirects: boolean;
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
  formatTemplateParameters: false,
  formatCategories: true,
  formatLists: true,
  formatFileLinks: true,
  formatReferences: false,
  formatInterlanguageLinks: false,
  interlanguagePlacement: "preserve",
  interlanguagePrefixes: [
    "ar",
    "de",
    "en",
    "es",
    "fr",
    "it",
    "ja",
    "ko",
    "pl",
    "pt",
    "ru",
    "uk",
    "zh",
    "zh-hans",
    "zh-hant",
  ],
  formatSectionSpacing: false,
  formatBehaviorSwitches: true,
  formatRedirects: true,
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

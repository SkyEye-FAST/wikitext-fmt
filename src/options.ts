export type FormatLevel = "safe" | "normal" | "experimental";
export type HtmlVoidTagStyle = "html5" | "xhtml" | "preserve";
export type TableCellSeparatorStyle = "auto" | "split" | "preserve";
export type BehaviorSwitchPlacement = "preserve" | "footer";
export type InterlanguagePlacement = "preserve" | "footer";
export type LocalizationSource = "builtin" | "siteinfo" | "custom";
export type LocalizedSyntaxStyle = "preserve" | "canonical-english";
export type FormatProfile = "default" | "production" | "aggressive";

export interface LocalizationAliases {
  categoryNamespaces?: string[];
  fileNamespaces?: string[];
  defaultsortMagicWords?: string[];
  redirectMagicWords?: string[];
  imageOptionAliases?: Record<string, string[]>;
  behaviorSwitches?: Record<string, string[]>;
}

export interface FormatOptions {
  profile?: FormatProfile;
  parserConfig?: string;
  lineWidth?: number;
  formatHeadings?: boolean;
  formatTemplates?: boolean;
  formatTemplateParameters?: boolean;
  formatCategories?: boolean;
  formatLists?: boolean;
  formatFileLinks?: boolean;
  formatExternalLinks?: boolean;
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
  profile: FormatProfile;
  parserConfig: string;
  lineWidth: number;
  formatHeadings: boolean;
  formatTemplates: boolean;
  formatTemplateParameters: boolean;
  formatCategories: boolean;
  formatLists: boolean;
  formatFileLinks: boolean;
  formatExternalLinks: boolean;
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
  profile: "default",
  parserConfig: "mediawiki",
  lineWidth: 120,
  formatHeadings: true,
  formatTemplates: true,
  formatTemplateParameters: false,
  formatCategories: true,
  formatLists: true,
  formatFileLinks: true,
  formatExternalLinks: false,
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
  formatTables: true,
  tableCellSeparatorStyle: "auto",
  normalizeBlankLines: true,
  level: "normal",
  htmlVoidTagStyle: "html5",
};

export function resolveOptions(
  options: FormatOptions = {},
): ResolvedFormatOptions {
  const profile = options.profile ?? "default";
  const profileOptions: FormatOptions =
    profile === "production" || profile === "aggressive"
      ? {
          level: "experimental",
          formatTemplates: true,
          formatTemplateParameters: true,
          formatTables: true,
          tableCellSeparatorStyle: "auto",
          formatReferences: true,
          formatExternalLinks: true,
          formatSectionSpacing: true,
        }
      : {};
  return { ...defaultOptions, ...profileOptions, ...options, profile };
}

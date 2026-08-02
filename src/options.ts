export type FormatLevel = "safe" | "normal" | "experimental";
export type HtmlVoidTagStyle = "html5" | "xhtml" | "preserve";
export type TableCellSeparatorStyle = "auto" | "split" | "preserve";
export type TemplateParameterLayout = "compact" | "flush" | "indented";
export type InlineTemplateSpacing = "auto" | "compact" | "spaced";
export type BehaviorSwitchPlacement = "preserve" | "footer";
export type InterlanguagePlacement = "preserve" | "footer";
export type LocalizationSource = "builtin" | "siteinfo" | "custom";
export type LocalizedSyntaxStyle = "preserve" | "canonical-english";
export type FormatProfile = "default" | "production";

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
  inlineTemplateSpacing?: InlineTemplateSpacing;
  templateParameterLayout?: TemplateParameterLayout;
  formatCategories?: boolean;
  formatLists?: boolean;
  formatFileLinks?: boolean;
  formatWikilinks?: boolean;
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
  inlineTemplateSpacing: InlineTemplateSpacing;
  templateParameterLayout: TemplateParameterLayout;
  formatCategories: boolean;
  formatLists: boolean;
  formatFileLinks: boolean;
  formatWikilinks: boolean;
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
  inlineTemplateSpacing: "auto",
  templateParameterLayout: "flush",
  formatCategories: true,
  formatLists: true,
  formatFileLinks: true,
  formatWikilinks: true,
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

const formatProfileOverrides: Readonly<
  Record<FormatProfile, Readonly<Partial<ResolvedFormatOptions>>>
> = {
  default: {},
  production: {
    level: "normal",
    formatTemplates: true,
    formatTables: true,
    tableCellSeparatorStyle: "auto",
    formatReferences: true,
    formatExternalLinks: true,
    formatSectionSpacing: true,
    formatInterlanguageLinks: true,
    interlanguagePlacement: "footer",
  },
};

export const formatProfiles: readonly FormatProfile[] = Object.freeze([
  "default",
  "production",
]);

function cloneOptionValue<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    return [...value] as Value;
  }
  if (value !== null && typeof value === "object") {
    return { ...value } as Value;
  }
  return value;
}

function cloneResolvedOptions<
  Options extends Readonly<Partial<ResolvedFormatOptions>>,
>(options: Options): Options {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [key, cloneOptionValue(value)]),
  ) as Options;
}

/**
 * Returns a fresh copy of the options controlled by a formatter profile.
 *
 * Settings UIs can use this browser-safe helper to stay aligned with profile
 * semantics without duplicating the core preset definitions.
 */
export function getFormatProfileOverrides(
  profile: FormatProfile,
): Readonly<Partial<ResolvedFormatOptions>> {
  return cloneResolvedOptions(formatProfileOverrides[profile]);
}

/**
 * Resolves a formatter profile without reading the filesystem, network, or
 * Node APIs. The returned options are independent from future calls.
 */
export function resolveFormatProfile(
  profile: FormatProfile,
): ResolvedFormatOptions {
  return {
    ...cloneResolvedOptions(defaultOptions),
    ...getFormatProfileOverrides(profile),
    profile,
  };
}

export function resolveOptions(
  options: FormatOptions = {},
): ResolvedFormatOptions {
  const profile = options.profile ?? "default";
  return {
    ...resolveFormatProfile(profile),
    ...options,
    parserConfig: options.parserConfig ?? defaultOptions.parserConfig,
    profile,
  };
}

export {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextResult,
  formatWikitextSafe,
  formatWikitextSafeDetailed,
  type FormatDetailedResult,
  type FormatResult,
} from "./formatter.js";
export {
  defaultOptions,
  type BehaviorSwitchPlacement,
  type FormatLevel,
  type FormatOptions,
  type HtmlVoidTagStyle,
  type InterlanguagePlacement,
  type LocalizationAliases,
  type LocalizationSource,
  type LocalizedSyntaxStyle,
  type TableCellSeparatorStyle,
} from "./options.js";
export { ruleLevels, type RuleName } from "./rules/index.js";
export type { FooterDiagnostics } from "./rules/categories.js";
export type { FileLinkDiagnostics } from "./rules/fileLinks.js";
export type { RedirectDiagnostics } from "./rules/redirects.js";
export type { SectionSpacingDiagnostics } from "./rules/sectionSpacing.js";
export type { TemplateParameterDiagnostics } from "./rules/templateParameters.js";
export type { TableDiagnostic } from "./rules/tables.js";
export type { ResolvedLocalizationAliases } from "./localization/aliases.js";
export type { DiagnosticsSummary } from "./cli/diagnostics.js";
export { loadSiteInfoAliases } from "./localization/siteinfo.js";

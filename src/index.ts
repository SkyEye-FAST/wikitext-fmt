export {
  type FormatDetailedResult,
  type FormatFailure,
  type FormatFailureCode,
  type FormatResult,
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextResult,
  formatWikitextSafe,
  formatWikitextSafeDetailed,
} from "./formatter.js";
export {
  type BehaviorSwitchPlacement,
  defaultOptions,
  type FormatLevel,
  type FormatOptions,
  type FormatProfile,
  type HtmlVoidTagStyle,
  type InlineTemplateSpacing,
  type InterlanguagePlacement,
  type LocalizationAliases,
  type LocalizationSource,
  type LocalizedSyntaxStyle,
  type TableCellSeparatorStyle,
  type TemplateParameterLayout,
} from "./options.js";
export { ruleLevels, type RuleName } from "./rules/index.js";
export type { FooterDiagnostics } from "./rules/categories.js";
export type { ExternalLinkDiagnostics } from "./rules/externalLinks.js";
export type { FileLinkDiagnostics } from "./rules/fileLinks.js";
export type { WikilinkDiagnostics } from "./rules/wikilinks.js";
export type { ReferenceDiagnostics } from "./rules/references.js";
export type { RedirectDiagnostics } from "./rules/redirects.js";
export type { SectionSpacingDiagnostics } from "./rules/sectionSpacing.js";
export type { TemplateParameterDiagnostics } from "./rules/templateParameters.js";
export type { TemplateDiagnostics } from "./rules/templates.js";
export type {
  TableDiagnostic,
  TableFormatDiagnostics,
} from "./rules/tables.js";
export {
  type StructuralEquivalenceKind,
  type StructuralEquivalenceResult,
  verifyStructuralEquivalence,
} from "./equivalence.js";
export type { ResolvedLocalizationAliases } from "./localization/aliases.js";
export type { DiagnosticsSummary } from "./cli/diagnostics.js";
export {
  loadSiteInfoAliases,
  normalizeSiteInfoPayload,
} from "./localization/siteinfo.js";
export {
  classifyParserFunction,
  type ParserFunctionFormattingClass,
  type ParserFunctionPolicy,
} from "./parserFunctionPolicy.js";
export {
  CONFIG_FILENAMES,
  discoverConfig,
  loadConfig,
  validateConfig,
} from "./config.js";

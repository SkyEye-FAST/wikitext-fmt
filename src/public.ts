export type {
  ExternalLinkDiagnostics,
  FormatDetailedResult,
  FormatFailure,
  FormatFailureCode,
  FormatResult,
  FooterDiagnostics,
  FileLinkDiagnostics,
  InterlanguageLinkSkipReason,
  ListDiagnostics,
  ListSkipReason,
  RedirectDiagnostics,
  ReferenceDiagnostics,
  SectionSpacingDiagnostics,
  StructuralEquivalenceKind,
  StructuralEquivalenceResult,
  TableDiagnostic,
  TableFormatDiagnostics,
  TemplateDiagnostics,
  WikilinkDiagnostics,
} from "./publicTypes.js";
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
export type { ResolvedLocalizationAliases } from "./localization/aliases.js";
export type { DiagnosticsSummary } from "./diagnosticsSummary.js";
export {
  loadSiteInfoAliases,
  loadSiteInfoFormattingData,
  normalizeSiteInfoFormattingPayload,
  normalizeSiteInfoPayload,
  type SiteInfoFormattingData,
} from "./localization/siteinfo.js";
export {
  classifyParserFunction,
  type ParserFunctionFormattingClass,
  type ParserFunctionPolicy,
} from "./parserFunctionPolicy.js";

import type {
  FormatOptions,
  TableCellSeparatorStyle,
} from "./options.js";

export interface FooterDiagnostics {
  behaviorSwitchesMoved: number;
  behaviorSwitchesFormatted: number;
  defaultsortMoved: number;
  categoriesMoved: number;
  localizedCategoryAliasesCanonicalized: number;
  localizedDefaultsortAliasesCanonicalized: number;
  localizedBehaviorSwitchesCanonicalized: number;
  interlanguageLinksMoved: number;
  interlanguageLinksFormatted: number;
}

export interface ExternalLinkDiagnostics {
  externalLinksFormatted: number;
  externalLinksSkippedUnsafe: number;
}

export interface FileLinkDiagnostics {
  fileLinksFormatted: number;
  localizedFileNamespaceAliasesCanonicalized: number;
  localizedImageOptionsCanonicalized: number;
}

export type ListSkipReason =
  | "not-parser-confirmed"
  | "ambiguous-marker-boundary"
  | "unicode-separator"
  | "multiline-content"
  | "unclosed-comment"
  | "ignore-range"
  | "protected-block"
  | "structure-changed"
  | "candidate-not-roundtrip-safe";

export interface ListDiagnostics {
  listLinesInspected: number;
  listLinesEligible: number;
  listLinesChanged: number;
  listLinesAlreadyCanonical: number;
  listLinesSkipped: number;
  mixedMarkerLinesChanged: number;
  commentBearingLinesChanged: number;
  structuredContentLinesChanged: number;
  skipReasons: Partial<Record<ListSkipReason, number>>;
}

export interface ReferenceDiagnostics {
  referencesFormatted: number;
  referenceGroupsFormatted: number;
  referenceLinesSkippedUnsafe: number;
}

export interface RedirectDiagnostics {
  redirectsFormatted: number;
  localizedRedirectAliasesCanonicalized: number;
}

export interface SectionSpacingDiagnostics {
  sectionSpacingBeforeHeadingsInserted: number;
  sectionSpacingAfterHeadingsInserted: number;
}

export interface TableLineDiagnostic {
  tableLine: number;
  sourceLine?: number;
  changed: boolean;
  reason?: string;
}

export interface TableDiagnostic {
  semanticId?: string;
  start: number;
  end: number;
  line: number;
  changed: boolean;
  ambiguous: boolean;
  reason?: string;
  separatorStyle?: Exclude<TableCellSeparatorStyle, "auto">;
  separatorStyleReason?: string;
  lineDiagnostics?: TableLineDiagnostic[];
}

export interface TableFormatDiagnostics {
  tablesInspected: number;
  tablesEligible: number;
  tablesChanged: number;
  tablesAlreadyCanonical: number;
  tablesSkippedAmbiguous: number;
  formattingPassesUsed: number;
  convergenceLimitReached: boolean;
  tableSemanticIds: string[];
  changedTableSemanticIds: string[];
}

export interface TemplateDiagnostics {
  templatesInspected: number;
  templatesEligible: number;
  templatesChanged: number;
  templatesAlreadyCanonical: number;
  templatesSkippedAmbiguous: number;
  uniqueTemplatesFormatted: number;
  /** @deprecated Use uniqueTemplatesFormatted. */
  templatesFormatted: number;
  templatesExpandedToMultiline: number;
  existingMultilineTemplatesNormalized: number;
  templatesSkipped: number;
  skipReasons: Record<string, number>;
  formattingPassesUsed: number;
  convergenceLimitReached: boolean;
  /** @deprecated Compatibility counters for the pre-1.0 API. */
  templateParametersFormatted: number;
  /** @deprecated Compatibility counters for the pre-1.0 API. */
  templateParameterLinesFormatted: number;
  /** @deprecated Compatibility counters for the pre-1.0 API. */
  templateParameterLinesSkippedUnsafe: number;
  templateSemanticIds: string[];
  changedTemplateSemanticIds: string[];
}

/** @deprecated Use TemplateDiagnostics from the unified template formatter. */
export type TemplateParameterDiagnostics = TemplateDiagnostics;

export type WikilinkSkipReason =
  | "file-link"
  | "category-assignment"
  | "interwiki-or-interlanguage"
  | "fragment-only"
  | "unstable-parser-target"
  | "unsafe-parent";

export interface WikilinkDiagnostics {
  wikilinksInspected: number;
  wikilinksEligible: number;
  wikilinksFormatted: number;
  underscoresReplaced: number;
  wikilinksWithFragmentsFormatted: number;
  wikilinksSkippedUnsafe: number;
  skipReasons: Partial<Record<WikilinkSkipReason, number>>;
}

export type StructuralEquivalenceKind = "templates" | "tables" | "document";

export interface StructuralEquivalenceResult {
  equivalent: boolean;
  structure: StructuralEquivalenceKind;
  reason?: string;
}

export interface FormatResult {
  formatted: string;
  failure?: FormatFailure;
  warning?: string;
}

export type FormatFailureCode =
  | "input-parse"
  | "input-roundtrip"
  | "unsupported-parser-config"
  | "unsupported-line-endings"
  | "output-parse"
  | "template-equivalence"
  | "table-equivalence"
  | "document-equivalence"
  | "idempotency"
  | "template-convergence"
  | "table-convergence"
  | "formatter-exception";

export interface FormatFailure {
  code: FormatFailureCode;
  stage?: string;
  message: string;
}

export interface FormatDetailedResult extends FormatResult {
  tableDiagnostics: TableDiagnostic[];
  tableFormatDiagnostics: TableFormatDiagnostics;
  footerDiagnostics: FooterDiagnostics;
  redirectDiagnostics: RedirectDiagnostics;
  fileLinkDiagnostics: FileLinkDiagnostics;
  wikilinkDiagnostics: WikilinkDiagnostics;
  externalLinkDiagnostics: ExternalLinkDiagnostics;
  referenceDiagnostics: ReferenceDiagnostics;
  listDiagnostics: ListDiagnostics;
  sectionSpacingDiagnostics: SectionSpacingDiagnostics;
  templateParameterDiagnostics: TemplateParameterDiagnostics;
  equivalenceDiagnostics: StructuralEquivalenceResult[];
}

export interface FormatterApi {
  formatWikitext(source: string, options?: FormatOptions): string;
  formatWikitextDetailedResult(
    source: string,
    options?: FormatOptions,
  ): FormatDetailedResult;
  formatWikitextResult(source: string, options?: FormatOptions): FormatResult;
  formatWikitextSafe(source: string, options?: FormatOptions): FormatResult;
  formatWikitextSafeDetailed(
    source: string,
    options?: FormatOptions,
  ): FormatDetailedResult;
}

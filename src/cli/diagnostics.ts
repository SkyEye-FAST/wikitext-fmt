import type { FormatDetailedResult, FormatFailure } from "../formatter.js";

export interface DiagnosticsSummary {
  tables: number;
  formattedTables: number;
  skippedTables: number;
  tablesInspected: number;
  tablesEligible: number;
  tablesChanged: number;
  tablesAlreadyCanonical: number;
  tablesSkippedAmbiguous: number;
  tableFormattingPassesUsed: number;
  formattedLines: number;
  skippedUnsafeLines: number;
  behaviorSwitchesMoved: number;
  behaviorSwitchesFormatted: number;
  defaultsortMoved: number;
  categoriesMoved: number;
  localizedCategoryAliasesCanonicalized: number;
  localizedDefaultsortAliasesCanonicalized: number;
  localizedBehaviorSwitchesCanonicalized: number;
  interlanguageLinksMoved: number;
  interlanguageLinksFormatted: number;
  redirectsFormatted: number;
  localizedRedirectAliasesCanonicalized: number;
  fileLinksFormatted: number;
  localizedFileNamespaceAliasesCanonicalized: number;
  localizedImageOptionsCanonicalized: number;
  externalLinksFormatted: number;
  externalLinksSkippedUnsafe: number;
  referencesFormatted: number;
  referenceGroupsFormatted: number;
  referenceLinesSkippedUnsafe: number;
  sectionSpacingBeforeHeadingsInserted: number;
  sectionSpacingAfterHeadingsInserted: number;
  templateParametersFormatted: number;
  templateParameterLinesFormatted: number;
  templateParameterLinesSkippedUnsafe: number;
  templatesInspected: number;
  templatesEligible: number;
  templatesChanged: number;
  templatesAlreadyCanonical: number;
  templatesSkippedAmbiguous: number;
  uniqueTemplatesFormatted: number;
  templatesFormatted: number;
  templatesExpandedToMultiline: number;
  existingMultilineTemplatesNormalized: number;
  templatesSkipped: number;
  formattingPassesUsed: number;
}

export interface FileDiagnostics {
  file: string;
  changed: boolean;
  failure: FormatFailure | null;
  warning: string | null;
  summary: DiagnosticsSummary;
  tableDiagnostics: FormatDetailedResult["tableDiagnostics"];
}

export function emptyDiagnosticsSummary(): DiagnosticsSummary {
  return {
    tables: 0,
    formattedTables: 0,
    skippedTables: 0,
    tablesInspected: 0,
    tablesEligible: 0,
    tablesChanged: 0,
    tablesAlreadyCanonical: 0,
    tablesSkippedAmbiguous: 0,
    tableFormattingPassesUsed: 0,
    formattedLines: 0,
    skippedUnsafeLines: 0,
    behaviorSwitchesMoved: 0,
    behaviorSwitchesFormatted: 0,
    defaultsortMoved: 0,
    categoriesMoved: 0,
    localizedCategoryAliasesCanonicalized: 0,
    localizedDefaultsortAliasesCanonicalized: 0,
    localizedBehaviorSwitchesCanonicalized: 0,
    interlanguageLinksMoved: 0,
    interlanguageLinksFormatted: 0,
    redirectsFormatted: 0,
    localizedRedirectAliasesCanonicalized: 0,
    fileLinksFormatted: 0,
    localizedFileNamespaceAliasesCanonicalized: 0,
    localizedImageOptionsCanonicalized: 0,
    externalLinksFormatted: 0,
    externalLinksSkippedUnsafe: 0,
    referencesFormatted: 0,
    referenceGroupsFormatted: 0,
    referenceLinesSkippedUnsafe: 0,
    sectionSpacingBeforeHeadingsInserted: 0,
    sectionSpacingAfterHeadingsInserted: 0,
    templateParametersFormatted: 0,
    templateParameterLinesFormatted: 0,
    templateParameterLinesSkippedUnsafe: 0,
    templatesInspected: 0,
    templatesEligible: 0,
    templatesChanged: 0,
    templatesAlreadyCanonical: 0,
    templatesSkippedAmbiguous: 0,
    uniqueTemplatesFormatted: 0,
    templatesFormatted: 0,
    templatesExpandedToMultiline: 0,
    existingMultilineTemplatesNormalized: 0,
    templatesSkipped: 0,
    formattingPassesUsed: 0,
  };
}

export function addDiagnosticsSummary(
  a: DiagnosticsSummary,
  b: DiagnosticsSummary,
): DiagnosticsSummary {
  const result = emptyDiagnosticsSummary();
  for (const key of Object.keys(result) as Array<keyof DiagnosticsSummary>) {
    result[key] = a[key] + b[key];
  }
  return result;
}

export function createDiagnosticsSummary(
  result: FormatDetailedResult,
): DiagnosticsSummary {
  return {
    ...emptyDiagnosticsSummary(),
    tables: result.tableFormatDiagnostics.tablesInspected,
    formattedTables: result.tableFormatDiagnostics.tablesChanged,
    skippedTables: result.tableFormatDiagnostics.tablesSkippedAmbiguous,
    tablesInspected: result.tableFormatDiagnostics.tablesInspected,
    tablesEligible: result.tableFormatDiagnostics.tablesEligible,
    tablesChanged: result.tableFormatDiagnostics.tablesChanged,
    tablesAlreadyCanonical:
      result.tableFormatDiagnostics.tablesAlreadyCanonical,
    tablesSkippedAmbiguous:
      result.tableFormatDiagnostics.tablesSkippedAmbiguous,
    tableFormattingPassesUsed:
      result.tableFormatDiagnostics.formattingPassesUsed,
    formattedLines: result.tableDiagnostics.reduce(
      (count, diagnostic) =>
        count +
        (diagnostic.lineDiagnostics?.filter((line) => line.changed).length ??
          0),
      0,
    ),
    skippedUnsafeLines: result.tableDiagnostics.reduce(
      (count, diagnostic) =>
        count +
        (diagnostic.lineDiagnostics?.filter((line) => line.reason).length ?? 0),
      0,
    ),
    ...result.footerDiagnostics,
    ...result.redirectDiagnostics,
    ...result.fileLinkDiagnostics,
    ...result.externalLinkDiagnostics,
    ...result.referenceDiagnostics,
    ...result.sectionSpacingDiagnostics,
    templateParametersFormatted:
      result.templateParameterDiagnostics.templateParametersFormatted,
    templateParameterLinesFormatted:
      result.templateParameterDiagnostics.templateParameterLinesFormatted,
    templateParameterLinesSkippedUnsafe:
      result.templateParameterDiagnostics.templateParameterLinesSkippedUnsafe,
    templatesInspected: result.templateParameterDiagnostics.templatesInspected,
    templatesEligible: result.templateParameterDiagnostics.templatesEligible,
    templatesChanged: result.templateParameterDiagnostics.templatesChanged,
    templatesAlreadyCanonical:
      result.templateParameterDiagnostics.templatesAlreadyCanonical,
    templatesSkippedAmbiguous:
      result.templateParameterDiagnostics.templatesSkippedAmbiguous,
    uniqueTemplatesFormatted:
      result.templateParameterDiagnostics.uniqueTemplatesFormatted,
    templatesFormatted: result.templateParameterDiagnostics.templatesFormatted,
    templatesExpandedToMultiline:
      result.templateParameterDiagnostics.templatesExpandedToMultiline,
    existingMultilineTemplatesNormalized:
      result.templateParameterDiagnostics.existingMultilineTemplatesNormalized,
    templatesSkipped: result.templateParameterDiagnostics.templatesSkipped,
    formattingPassesUsed:
      result.templateParameterDiagnostics.formattingPassesUsed,
  };
}

export function createDiagnosticsRecord(
  file: string,
  source: string,
  result: FormatDetailedResult,
): FileDiagnostics {
  const summary = createDiagnosticsSummary(result);
  return {
    file,
    changed: result.formatted !== source,
    failure: result.failure ?? null,
    warning: result.warning ?? null,
    summary,
    tableDiagnostics: result.tableDiagnostics,
  };
}

export function serializeDiagnostics(
  file: string,
  source: string,
  result: FormatDetailedResult,
): string {
  return JSON.stringify(createDiagnosticsRecord(file, source, result));
}

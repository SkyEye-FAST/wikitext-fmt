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
  wikilinksInspected: number;
  wikilinksEligible: number;
  wikilinksFormatted: number;
  underscoresReplaced: number;
  wikilinksWithFragmentsFormatted: number;
  wikilinksSkippedUnsafe: number;
  externalLinksFormatted: number;
  externalLinksSkippedUnsafe: number;
  referencesFormatted: number;
  referenceGroupsFormatted: number;
  referenceLinesSkippedUnsafe: number;
  listLinesInspected: number;
  listLinesEligible: number;
  listLinesChanged: number;
  listLinesAlreadyCanonical: number;
  listLinesSkipped: number;
  mixedMarkerLinesChanged: number;
  commentBearingLinesChanged: number;
  structuredContentLinesChanged: number;
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
  listDiagnostics: FormatDetailedResult["listDiagnostics"];
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
    wikilinksInspected: 0,
    wikilinksEligible: 0,
    wikilinksFormatted: 0,
    underscoresReplaced: 0,
    wikilinksWithFragmentsFormatted: 0,
    wikilinksSkippedUnsafe: 0,
    externalLinksFormatted: 0,
    externalLinksSkippedUnsafe: 0,
    referencesFormatted: 0,
    referenceGroupsFormatted: 0,
    referenceLinesSkippedUnsafe: 0,
    listLinesInspected: 0,
    listLinesEligible: 0,
    listLinesChanged: 0,
    listLinesAlreadyCanonical: 0,
    listLinesSkipped: 0,
    mixedMarkerLinesChanged: 0,
    commentBearingLinesChanged: 0,
    structuredContentLinesChanged: 0,
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
    wikilinksInspected: result.wikilinkDiagnostics.wikilinksInspected,
    wikilinksEligible: result.wikilinkDiagnostics.wikilinksEligible,
    wikilinksFormatted: result.wikilinkDiagnostics.wikilinksFormatted,
    underscoresReplaced: result.wikilinkDiagnostics.underscoresReplaced,
    wikilinksWithFragmentsFormatted:
      result.wikilinkDiagnostics.wikilinksWithFragmentsFormatted,
    wikilinksSkippedUnsafe:
      result.wikilinkDiagnostics.wikilinksSkippedUnsafe,
    ...result.externalLinkDiagnostics,
    ...result.referenceDiagnostics,
    listLinesInspected: result.listDiagnostics.listLinesInspected,
    listLinesEligible: result.listDiagnostics.listLinesEligible,
    listLinesChanged: result.listDiagnostics.listLinesChanged,
    listLinesAlreadyCanonical:
      result.listDiagnostics.listLinesAlreadyCanonical,
    listLinesSkipped:
      result.listDiagnostics.listLinesSkipped,
    mixedMarkerLinesChanged: result.listDiagnostics.mixedMarkerLinesChanged,
    commentBearingLinesChanged:
      result.listDiagnostics.commentBearingLinesChanged,
    structuredContentLinesChanged:
      result.listDiagnostics.structuredContentLinesChanged,
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
    listDiagnostics: result.listDiagnostics,
  };
}

export function serializeDiagnostics(
  file: string,
  source: string,
  result: FormatDetailedResult,
): string {
  return JSON.stringify(createDiagnosticsRecord(file, source, result));
}

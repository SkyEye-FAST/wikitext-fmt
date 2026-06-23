import type { FormatDetailedResult } from "../formatter.js";

export interface DiagnosticsSummary {
  tables: number;
  formattedTables: number;
  skippedTables: number;
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
}

export interface FileDiagnostics {
  file: string;
  changed: boolean;
  warning: string | null;
  summary: DiagnosticsSummary;
  tableDiagnostics: FormatDetailedResult["tableDiagnostics"];
}

export function emptyDiagnosticsSummary(): DiagnosticsSummary {
  return {
    tables: 0,
    formattedTables: 0,
    skippedTables: 0,
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
    tables: result.tableDiagnostics.length,
    formattedTables: result.tableDiagnostics.filter(
      (diagnostic) => diagnostic.changed,
    ).length,
    skippedTables: result.tableDiagnostics.filter(
      (diagnostic) => !diagnostic.changed,
    ).length,
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
    ...result.templateParameterDiagnostics,
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

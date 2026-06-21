import type { FormatDetailedResult } from "../formatter.js";

export interface DiagnosticsSummary {
  tables: number;
  formattedTables: number;
  skippedTables: number;
  formattedLines: number;
  skippedUnsafeLines: number;
}

export interface FileDiagnostics {
  file: string;
  changed: boolean;
  warning: string | null;
  summary: DiagnosticsSummary;
  tableDiagnostics: FormatDetailedResult["tableDiagnostics"];
}

export function createDiagnosticsRecord(
  file: string,
  source: string,
  result: FormatDetailedResult,
): FileDiagnostics {
  const summary: DiagnosticsSummary = {
    tables: result.tableDiagnostics.length,
    formattedTables: result.tableDiagnostics.filter((diagnostic) => diagnostic.changed).length,
    skippedTables: result.tableDiagnostics.filter((diagnostic) => !diagnostic.changed).length,
    formattedLines: result.tableDiagnostics.reduce(
      (count, diagnostic) => count + (diagnostic.lineDiagnostics?.filter((line) => line.changed).length ?? 0),
      0,
    ),
    skippedUnsafeLines: result.tableDiagnostics.reduce(
      (count, diagnostic) => count + (diagnostic.lineDiagnostics?.filter((line) => line.reason).length ?? 0),
      0,
    ),
  };
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

import type { FormatDetailedResult } from "../formatter.js";

export function serializeDiagnostics(
  file: string,
  source: string,
  result: FormatDetailedResult,
): string {
  const summary = {
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
  return JSON.stringify({
    file,
    changed: result.formatted !== source,
    warning: result.warning ?? null,
    summary,
    tableDiagnostics: result.tableDiagnostics,
  });
}

import type { FormatDetailedResult } from "../formatter.js";

export function serializeDiagnostics(
  file: string,
  source: string,
  result: FormatDetailedResult,
): string {
  return JSON.stringify({
    file,
    changed: result.formatted !== source,
    warning: result.warning ?? null,
    tableDiagnostics: result.tableDiagnostics,
  });
}

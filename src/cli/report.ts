import {
  addDiagnosticsSummary,
  emptyDiagnosticsSummary,
  type DiagnosticsSummary,
  type FileDiagnostics,
} from "./diagnostics.js";

export interface BatchReport {
  files: FileDiagnostics[];
  summary: Omit<DiagnosticsSummary, "formattedLines" | "skippedUnsafeLines"> & {
    files: number;
    changedFiles: number;
    warningFiles: number;
    failureCodes: Record<string, number>;
    formattedTableLines: number;
    skippedUnsafeTableLines: number;
  };
}

export function createBatchReport(files: FileDiagnostics[]): BatchReport {
  const diagnostics = files.reduce(
    (summary, file) => addDiagnosticsSummary(summary, file.summary),
    emptyDiagnosticsSummary(),
  );
  const { formattedLines, skippedUnsafeLines, ...diagnosticSummary } =
    diagnostics;
  return {
    files,
    summary: {
      files: files.length,
      changedFiles: files.filter((file) => file.changed).length,
      warningFiles: files.filter((file) => file.warning !== null).length,
      failureCodes: files.reduce<Record<string, number>>((counts, file) => {
        if (file.failure) {
          counts[file.failure.code] = (counts[file.failure.code] ?? 0) + 1;
        }
        return counts;
      }, {}),
      ...diagnosticSummary,
      formattedTableLines: formattedLines,
      skippedUnsafeTableLines: skippedUnsafeLines,
    },
  };
}

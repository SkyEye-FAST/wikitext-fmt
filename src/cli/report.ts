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
      ...diagnosticSummary,
      formattedTableLines: formattedLines,
      skippedUnsafeTableLines: skippedUnsafeLines,
    },
  };
}

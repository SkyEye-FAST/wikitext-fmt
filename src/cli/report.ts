import type { FileDiagnostics } from "./diagnostics.js";

export interface BatchReport {
  files: FileDiagnostics[];
  summary: {
    files: number;
    changedFiles: number;
    warningFiles: number;
    tables: number;
    formattedTables: number;
    skippedTables: number;
    formattedTableLines: number;
    skippedUnsafeTableLines: number;
  };
}

export function createBatchReport(files: FileDiagnostics[]): BatchReport {
  return {
    files,
    summary: {
      files: files.length,
      changedFiles: files.filter((file) => file.changed).length,
      warningFiles: files.filter((file) => file.warning !== null).length,
      tables: files.reduce((total, file) => total + file.summary.tables, 0),
      formattedTables: files.reduce((total, file) => total + file.summary.formattedTables, 0),
      skippedTables: files.reduce((total, file) => total + file.summary.skippedTables, 0),
      formattedTableLines: files.reduce((total, file) => total + file.summary.formattedLines, 0),
      skippedUnsafeTableLines: files.reduce((total, file) => total + file.summary.skippedUnsafeLines, 0),
    },
  };
}

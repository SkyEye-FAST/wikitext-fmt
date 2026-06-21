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
    behaviorSwitchesMoved: number;
    behaviorSwitchesFormatted: number;
    defaultsortMoved: number;
    categoriesMoved: number;
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
      behaviorSwitchesMoved: files.reduce((total, file) => total + file.summary.behaviorSwitchesMoved, 0),
      behaviorSwitchesFormatted: files.reduce(
        (total, file) => total + file.summary.behaviorSwitchesFormatted,
        0,
      ),
      defaultsortMoved: files.reduce((total, file) => total + file.summary.defaultsortMoved, 0),
      categoriesMoved: files.reduce((total, file) => total + file.summary.categoriesMoved, 0),
    },
  };
}

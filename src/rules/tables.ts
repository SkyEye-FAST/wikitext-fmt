import type { Config } from "wikiparser-node";
import type { ResolvedFormatOptions, TableCellSeparatorStyle } from "../options.js";
import { parseWikitext } from "../parser.js";

interface Replacement {
  start: number;
  end: number;
  value: string;
}

export type TableLineFormatResult =
  | { changed: true; value: string }
  | { changed: false; value: string; reason?: string };

export interface TableLineDiagnostic {
  tableLine: number;
  sourceLine?: number;
  changed: boolean;
  reason?: string;
}

export type TableAnalysisResult =
  | {
      changed: true;
      value: string;
      separatorStyle: Exclude<TableCellSeparatorStyle, "auto">;
      lineDiagnostics: TableLineDiagnostic[];
    }
  | {
      changed: false;
      reason: string;
      separatorStyle?: Exclude<TableCellSeparatorStyle, "auto">;
      lineDiagnostics?: TableLineDiagnostic[];
    };

export interface TableDiagnostic {
  start: number;
  end: number;
  line: number;
  changed: boolean;
  reason?: string;
  separatorStyle?: Exclude<TableCellSeparatorStyle, "auto">;
  lineDiagnostics?: TableLineDiagnostic[];
}

export interface TableFormatWithDiagnosticsResult {
  formatted: string;
  diagnostics: TableDiagnostic[];
}

export function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position++) {
    if (source.charCodeAt(position) === 10) line++;
  }
  return line;
}

function splitSimpleCells(content: string, separator: "!!" | "||"): string[] | undefined {
  let bracketDepth = 0;
  let quote: "\"" | "'" | undefined;
  const parts: string[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index++) {
    const character = content[index]!;
    if (quote) {
      if (content.startsWith(separator, index)) return undefined;
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") bracketDepth++;
    else if (character === "]") {
      bracketDepth--;
      if (bracketDepth < 0) return undefined;
    }
    if (bracketDepth > 0 && content.startsWith(separator, index)) return undefined;
    if (bracketDepth === 0 && content.startsWith(separator, index)) {
      parts.push(content.slice(start, index).trimEnd());
      start = index + separator.length;
      index += separator.length - 1;
    }
  }

  if (quote || bracketDepth !== 0) return undefined;
  parts.push(content.slice(start).trimEnd());
  return parts.some((part) => part.trim() === "") ? undefined : parts;
}

function lineRiskReason(line: string): string | undefined {
  if (/\{\{|\}\}/u.test(line)) return "contains template or template-like syntax";
  if (/<[a-z!/]/iu.test(line)) return "contains HTML or extension tag";
  if (/[{}]/u.test(line)) return "contains ambiguous brace syntax";
  return undefined;
}

function formatStructuralLine(line: string, value: string, riskContent = line): TableLineFormatResult {
  const reason = lineRiskReason(riskContent);
  if (reason) return { changed: false, value: line, reason };
  return value === line ? { changed: false, value: line } : { changed: true, value };
}

function formatCellLine(
  line: string,
  content: string,
  marker: "!" | "|",
  separatorStyle: Exclude<TableCellSeparatorStyle, "auto">,
): TableLineFormatResult {
  const reason = lineRiskReason(line);
  if (reason) return { changed: false, value: line, reason };
  const separator = marker === "!" ? "!!" : "||";
  const cells = splitSimpleCells(content, separator);
  if (!cells) {
    return {
      changed: false,
      value: line,
      reason: marker === "!" ? "unsafe header cell separator" : "unsafe data cell separator",
    };
  }
  const value = separatorStyle === "split"
    ? cells.map((cell) => `${marker}${cell}`).join("\n")
    : `${marker}${content.trimEnd()}`;
  return value === line ? { changed: false, value: line } : { changed: true, value };
}

function hasCellAttributes(content: string): boolean {
  return /^\s*(?:[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s|]+)\s*)+\|\s*/u.test(content);
}

function detectTableCellSeparatorStyle(
  lines: readonly string[],
  options: Pick<ResolvedFormatOptions, "lineWidth" | "tableCellSeparatorStyle">,
): Exclude<TableCellSeparatorStyle, "auto"> {
  if (options.tableCellSeparatorStyle !== "auto") return options.tableCellSeparatorStyle;

  const cellLines = lines.slice(1, -1).map((line, index) => {
    const header = /^\s*!(.*)$/u.exec(line);
    const data = /^\s*\|(?![-+\}])(.*)$/u.exec(line);
    if (!header && !data) return undefined;
    const marker = header ? "!" : "|";
    const content = (header ?? data)![1]!;
    if (lineRiskReason(line)) return { index, marker, content, safe: false as const };
    const cells = splitSimpleCells(content, marker === "!" ? "!!" : "||");
    return cells
      ? { index, marker, content, cells, safe: true as const }
      : { index, marker, content, safe: false as const };
  }).filter((line) => line !== undefined);

  const safeLines = cellLines.filter((line) => line.safe);
  const maximumCellCount = Math.max(1, ...safeLines.map((line) => line.cells.length));
  const hasAttributes = cellLines.some((line) => hasCellAttributes(line.content));
  const hasLongInlineLine = safeLines.some((line) => line.cells.length > 1 && lines[line.index + 1]!.length > options.lineWidth);
  const hasSplitLines = safeLines.some((line, index) => {
    if (line.cells.length !== 1) return false;
    const previous = safeLines[index - 1];
    const next = safeLines[index + 1];
    return previous?.index === line.index - 1 && previous.marker === line.marker && previous.cells.length === 1
      || next?.index === line.index + 1 && next.marker === line.marker && next.cells.length === 1;
  });

  if (hasAttributes || maximumCellCount >= 4 || hasLongInlineLine || hasSplitLines) return "split";
  return "preserve";
}

function isRecognizedBodyLine(line: string): boolean {
  return /^\s*\|-/u.test(line)
    || /^\s*\|\+/u.test(line)
    || /^\s*!/u.test(line)
    || /^\s*\|(?!\})/u.test(line);
}

export function analyzeSimpleTableForTesting(
  raw: string,
  options: Pick<ResolvedFormatOptions, "lineWidth" | "tableCellSeparatorStyle"> = {
    lineWidth: 120,
    tableCellSeparatorStyle: "auto",
  },
): TableAnalysisResult {
  if (/\uE000wikitext-fmt:/u.test(raw)) return { changed: false, reason: "contains protected placeholder" };
  const lines = raw.split("\n");
  if (lines.length < 2 || !/^\s*\{\|/u.test(lines[0]!) || !/^\s*\|\}\s*$/u.test(lines.at(-1)!)) {
    return { changed: false, reason: "unbalanced table start or end" };
  }
  if (lines.slice(1).some((line) => /^\s*\{\|/u.test(line))) {
    return { changed: false, reason: "contains nested table" };
  }
  const unclearIndex = lines.slice(1, -1).findIndex((line) => !isRecognizedBodyLine(line));
  if (unclearIndex >= 0) {
    return { changed: false, reason: `unclear table line type at line ${unclearIndex + 2}` };
  }

  const separatorStyle = detectTableCellSeparatorStyle(lines, options);

  const output: string[] = [];
  const lineDiagnostics: TableLineDiagnostic[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    let result: TableLineFormatResult;
    if (index === 0) {
      const attributes = line.replace(/^\s*\{\|/u, "");
      result = formatStructuralLine(line, `{|${attributes.trimEnd()}`, attributes);
    } else if (index === lines.length - 1) {
      result = formatStructuralLine(line, "|}", "");
    } else if (/^\s*\|-/u.test(line) || /^\s*\|\+/u.test(line)) {
      result = formatStructuralLine(line, line.trimEnd());
    } else {
      const header = /^\s*!(.*)$/u.exec(line);
      const data = /^\s*\|(?![-+}])(.*)$/u.exec(line);
      result = header
        ? formatCellLine(line, header[1]!, "!", separatorStyle)
        : formatCellLine(line, data![1]!, "|", separatorStyle);
    }
    output.push(result.value);
    lineDiagnostics.push({
      tableLine: index + 1,
      changed: result.changed,
      ...(result.changed || !result.reason ? {} : { reason: result.reason }),
    });
  }
  const value = output.join("\n");
  if (value !== raw) return { changed: true, value, separatorStyle, lineDiagnostics };
  const skipped = lineDiagnostics.find((diagnostic) => diagnostic.reason);
  return {
    changed: false,
    reason: skipped?.reason ?? "already formatted",
    separatorStyle,
    lineDiagnostics,
  };
}

export function formatTablesWithDiagnostics(
  source: string,
  config: Config,
  _options: ResolvedFormatOptions,
): TableFormatWithDiagnosticsResult {
  const root = parseWikitext(source, config);
  const replacements: Replacement[] = [];
  const diagnostics: TableDiagnostic[] = [];
  for (const node of root.querySelectorAll("table")) {
    if (node.parentNode?.closest("table")) continue;
    const start = node.getAbsoluteIndex();
    const raw = node.toString();
    const end = start + raw.length;
    let result: TableAnalysisResult;
    if (node.parentNode?.closest("template")) {
      result = { changed: false, reason: "table is inside a template" };
    } else if (source.lastIndexOf("\n", start - 1) + 1 !== start) {
      result = { changed: false, reason: "table is not standalone" };
    } else {
      result = analyzeSimpleTableForTesting(raw, _options);
    }
    const startLine = lineNumberAt(source, start);
    const lineDiagnostics = result.lineDiagnostics?.map((diagnostic) => ({
      ...diagnostic,
      sourceLine: startLine + diagnostic.tableLine - 1,
    }));
    const hasSkippedUnsafeLines = result.changed && lineDiagnostics?.some((diagnostic) => diagnostic.reason);
    diagnostics.push({
      start,
      end,
      line: startLine,
      changed: result.changed,
      ...(result.changed
        ? hasSkippedUnsafeLines ? { reason: "formatted with skipped unsafe lines" } : {}
        : { reason: result.reason }),
      ...(result.separatorStyle ? { separatorStyle: result.separatorStyle } : {}),
      ...(lineDiagnostics ? { lineDiagnostics } : {}),
    });
    if (result.changed) replacements.push({ start, end, value: result.value });
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  return { formatted: output, diagnostics };
}

export function formatTables(source: string, config: Config, options: ResolvedFormatOptions): string {
  return formatTablesWithDiagnostics(source, config, options).formatted;
}

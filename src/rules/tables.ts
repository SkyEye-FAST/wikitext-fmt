import type { Config } from "wikiparser-node";
import type {
  ResolvedFormatOptions,
  TableCellSeparatorStyle,
} from "../options.js";
import {
  createParserContext,
  type ParsedDocumentContext,
} from "../parserContext.js";

export interface TableLineDiagnostic {
  tableLine: number;
  sourceLine?: number;
  changed: boolean;
  reason?: string;
}

export interface TableDiagnostic {
  start: number;
  end: number;
  line: number;
  changed: boolean;
  ambiguous: boolean;
  reason?: string;
  separatorStyle?: Exclude<TableCellSeparatorStyle, "auto">;
  separatorStyleReason?: string;
  lineDiagnostics?: TableLineDiagnostic[];
}

export interface TableFormatDiagnostics {
  tablesInspected: number;
  tablesEligible: number;
  tablesChanged: number;
  tablesAlreadyCanonical: number;
  tablesSkippedAmbiguous: number;
  formattingPassesUsed: number;
  convergenceLimitReached: boolean;
}

export interface TableFormatWithDiagnosticsResult {
  formatted: string;
  diagnostics: TableDiagnostic[];
  summary: TableFormatDiagnostics;
}

export interface ParserTableNode {
  type: string;
  subtype?: string;
  childNodes: readonly ParserTableNode[];
  parentNode?: ParserTableNode;
  firstChild?: ParserTableNode;
  getAbsoluteIndex(): number;
  toString(): string;
  querySelectorAll<T = ParserTableNode>(selector: string): T[];
  closed?: boolean;
}

export interface ParserTableCandidate {
  node: ParserTableNode;
  offset: number;
  start: number;
  end: number;
}

interface ParserTableAnalysis {
  start: number;
  end: number;
  value: string;
  changed: boolean;
  eligible: boolean;
  diagnostic: TableDiagnostic;
}

interface SourceRange {
  start: number;
  end: number;
}

interface InlineScanPosition {
  index: number;
  quote?: '"' | "'";
  templateDepth: number;
  wikilinkDepth: number;
  externalLinkDepth: number;
}

interface LexicalSeparators {
  positions: number[];
  balanced: boolean;
}

function emptySummary(): TableFormatDiagnostics {
  return {
    tablesInspected: 0,
    tablesEligible: 0,
    tablesChanged: 0,
    tablesAlreadyCanonical: 0,
    tablesSkippedAmbiguous: 0,
    formattingPassesUsed: 0,
    convergenceLimitReached: false,
  };
}

export function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position++) {
    if (source.charCodeAt(position) === 10) line++;
  }
  return line;
}

// wikiparser-node is authoritative for tables, rows, cells, and their ranges.
// Some releases tokenize `||`/`!!` inside link labels as cell boundaries. This
// scanner is intentionally restricted to separator confirmation inside a
// parser-confirmed table line and is used only when parser and lexical cell
// boundaries disagree.
function scanTopLevelTableCellText(
  content: string,
  onTopLevel: (position: InlineScanPosition) => boolean,
  onInsideQuote?: (position: InlineScanPosition) => boolean,
  isProtected?: (index: number) => boolean,
): boolean {
  let templateDepth = 0;
  let wikilinkDepth = 0;
  let externalLinkDepth = 0;
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < content.length; index++) {
    const character = content[index]!;
    if (isProtected?.(index)) continue;
    if (quote) {
      if (
        onInsideQuote &&
        !onInsideQuote({
          index,
          quote,
          templateDepth,
          wikilinkDepth,
          externalLinkDepth,
        })
      ) {
        return false;
      }
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (content.startsWith("{{", index)) {
      templateDepth++;
      index++;
      continue;
    }
    if (content.startsWith("}}", index)) {
      templateDepth--;
      if (templateDepth < 0) return false;
      index++;
      continue;
    }
    if (content.startsWith("[[", index)) {
      wikilinkDepth++;
      index++;
      continue;
    }
    if (content.startsWith("]]", index)) {
      wikilinkDepth--;
      if (wikilinkDepth < 0) return false;
      index++;
      continue;
    }
    if (character === "[" && content[index + 1] !== "[" && wikilinkDepth === 0) {
      externalLinkDepth++;
      continue;
    }
    if (character === "]" && content[index + 1] !== "]" && wikilinkDepth === 0) {
      externalLinkDepth--;
      if (externalLinkDepth < 0) return false;
      continue;
    }
    if (
      templateDepth === 0 &&
      wikilinkDepth === 0 &&
      externalLinkDepth === 0 &&
      !onTopLevel({
        index,
        quote,
        templateDepth,
        wikilinkDepth,
        externalLinkDepth,
      })
    ) {
      return false;
    }
  }
  return (
    !quote &&
    templateDepth === 0 &&
    wikilinkDepth === 0 &&
    externalLinkDepth === 0
  );
}

function nearestTable(
  node: ParserTableNode | undefined,
): ParserTableNode | undefined {
  let current = node;
  while (current && current.type !== "table") current = current.parentNode;
  return current;
}

function protectedTableRanges(
  table: ParserTableNode,
  tableStart: number,
): SourceRange[] {
  const ranges: SourceRange[] = [];
  for (const selector of ["ext", "comment", "table"]) {
    for (const node of table.querySelectorAll<ParserTableNode>(selector)) {
      if (node === table) continue;
      const start = node.getAbsoluteIndex() - tableStart;
      ranges.push({ start, end: start + node.toString().length });
    }
  }
  return ranges;
}

function positionIsProtected(
  position: number,
  ranges: readonly SourceRange[],
): boolean {
  return ranges.some((range) => position >= range.start && position < range.end);
}

function lexicalSeparatorPositions(
  raw: string,
  protectedRanges: readonly SourceRange[],
): LexicalSeparators {
  const positions: number[] = [];
  let balanced = true;
  let lineStart = 0;
  while (lineStart < raw.length) {
    const newline = raw.indexOf("\n", lineStart);
    const lineEnd = newline < 0 ? raw.length : newline;
    const line = raw.slice(lineStart, lineEnd);
    const match = /^[\t ]*[!|](?![-+}])/u.exec(line);
    if (match) {
      const contentStart = match[0].length;
      const content = line.slice(contentStart);
      balanced =
        scanTopLevelTableCellText(
          content,
          ({ index }) => {
            if (content.startsWith("!!", index) || content.startsWith("||", index)) {
              positions.push(lineStart + contentStart + index);
            }
            return true;
          },
          () => true,
          (index) =>
            positionIsProtected(
              lineStart + contentStart + index,
              protectedRanges,
            ),
        ) && balanced;
    }
    if (newline < 0) break;
    lineStart = newline + 1;
  }
  return {
    positions: [...new Set(positions)].sort((a, b) => a - b),
    balanced,
  };
}

function parserSeparatorPositions(table: ParserTableNode): number[] {
  const tableStart = table.getAbsoluteIndex();
  return table
    .querySelectorAll<ParserTableNode>("td")
    .filter((cell) => nearestTable(cell.parentNode) === table)
    .flatMap((cell) => {
      const syntax = cell.firstChild;
      if (!syntax) return [];
      const raw = syntax.toString();
      return raw === "!!" || raw === "||"
        ? [syntax.getAbsoluteIndex() - tableStart]
        : [];
    })
    .sort((a, b) => a - b);
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function analyzeParserTable(
  source: string,
  table: ParserTableNode,
  offset: number,
  options: ResolvedFormatOptions,
): ParserTableAnalysis {
  const localStart = table.getAbsoluteIndex();
  const start = localStart + offset;
  const raw = table.toString();
  const end = start + raw.length;
  const line = lineNumberAt(source, start);
  const style = options.tableCellSeparatorStyle === "preserve" ? "preserve" : "split";
  const separatorStyleReason =
    options.tableCellSeparatorStyle === "preserve"
      ? "explicit preserve option"
      : options.tableCellSeparatorStyle === "split"
        ? "explicit split option"
        : "aggressive auto splits every parser-confirmed multi-cell row";

  if (style === "preserve") {
    return {
      start,
      end,
      value: raw,
      changed: false,
      eligible: true,
      diagnostic: {
        start,
        end,
        line,
        changed: false,
        ambiguous: false,
        reason: "inline cell separators explicitly preserved",
        separatorStyle: style,
        separatorStyleReason,
      },
    };
  }

  const parserPositions = parserSeparatorPositions(table);
  const lexical = lexicalSeparatorPositions(
    raw,
    protectedTableRanges(table, localStart),
  );
  const parserBoundariesReliable = arraysEqual(
    parserPositions,
    lexical.positions,
  );
  if (!parserBoundariesReliable && !lexical.balanced) {
    return {
      start,
      end,
      value: raw,
      changed: false,
      eligible: false,
      diagnostic: {
        start,
        end,
        line,
        changed: false,
        ambiguous: true,
        reason:
          "parser cell tokenization disagreed and the balanced top-level separator fallback could not establish boundaries",
        separatorStyle: style,
        separatorStyleReason,
      },
    };
  }
  const positions = parserBoundariesReliable
    ? parserPositions
    : lexical.positions;
  let value = raw;
  for (const position of [...positions].sort((a, b) => b - a)) {
    const marker = raw[position] === "!" ? "!" : "|";
    value = `${value.slice(0, position)}\n${marker}${value.slice(position + 2)}`;
  }
  const lineDiagnostics: TableLineDiagnostic[] = [
    ...new Set(positions.map((position) => lineNumberAt(raw, position))),
  ].map((tableLine) => ({ tableLine, changed: true }));
  const changed = value !== raw;
  const fallbackReason = parserBoundariesReliable
    ? undefined
    : "parser cell tokenization disagreed with balanced link-aware separators; used documented top-level fallback";
  return {
    start,
    end,
    value,
    changed,
    eligible: true,
    diagnostic: {
      start,
      end,
      line,
      changed,
      ambiguous: false,
      ...(!changed
        ? { reason: "no inline parser-confirmed cell separators" }
        : fallbackReason
          ? { reason: fallbackReason }
          : {}),
      separatorStyle: style,
      separatorStyleReason,
      ...(lineDiagnostics.length > 0 ? { lineDiagnostics } : {}),
    },
  };
}

export function collectParserTableCandidates(
  source: string,
  context: ParsedDocumentContext,
  config: Config,
): ParserTableCandidate[] {
  const candidates = new Map<string, ParserTableCandidate>();
  const add = (node: ParserTableNode, offset: number): void => {
    if (node.closed === false) return;
    const start = node.getAbsoluteIndex() + offset;
    const end = start + node.toString().length;
    const key = `${start}:${end}`;
    if (!candidates.has(key)) candidates.set(key, { node, offset, start, end });
  };
  for (const node of context.root.querySelectorAll<ParserTableNode>("table")) {
    add(node, 0);
  }

  // Known parser-order defect: table nodes inside template parameter text are
  // not always exposed. Reparse only at an exact opener and accept only a
  // closed parser-confirmed table range beginning at that offset.
  let opener = source.indexOf("{|");
  while (opener >= 0) {
    const reparsed = createParserContext(source.slice(opener), config);
    for (const node of reparsed.root.querySelectorAll<ParserTableNode>("table")) {
      add(node, opener);
    }
    opener = source.indexOf("{|", opener + 2);
  }
  return [...candidates.values()].sort((a, b) => a.start - b.start);
}

function hasChangedNestedTable(
  analysis: ParserTableAnalysis,
  analyses: readonly ParserTableAnalysis[],
): boolean {
  return analyses.some(
    (candidate) =>
      candidate !== analysis &&
      candidate.changed &&
      candidate.start > analysis.start &&
      candidate.end < analysis.end,
  );
}

function formatParserTables(
  source: string,
  config: Config,
  options: ResolvedFormatOptions,
  context?: ParsedDocumentContext,
): TableFormatWithDiagnosticsResult {
  const maxPasses = 64;
  let output = source;
  let firstContext = context?.source === source ? context : undefined;
  let diagnostics: TableDiagnostic[] = [];
  const summary = emptySummary();
  const changedNodeIndices = new Set<number>();

  const finalize = (formatted: string): TableFormatWithDiagnosticsResult => {
    summary.tablesChanged = changedNodeIndices.size;
    summary.tablesAlreadyCanonical = Math.max(
      0,
      summary.tablesEligible -
        summary.tablesChanged -
        summary.tablesSkippedAmbiguous,
    );
    diagnostics = diagnostics.map((diagnostic, index) => ({
      ...diagnostic,
      changed: changedNodeIndices.has(index),
    }));
    return { formatted, diagnostics, summary };
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    const current = firstContext ?? createParserContext(output, config);
    firstContext = undefined;
    const tables = collectParserTableCandidates(output, current, config);
    const analyses = tables.map(({ node, offset }) =>
      analyzeParserTable(output, node, offset, options),
    );
    if (pass === 0) {
      diagnostics = analyses.map(({ diagnostic }) => diagnostic);
      summary.tablesInspected = analyses.length;
      summary.tablesEligible = analyses.length;
      summary.tablesSkippedAmbiguous = analyses.filter(
        ({ eligible }) => !eligible,
      ).length;
    }
    const deepest = analyses
      .map((analysis, index) => ({ analysis, index }))
      .filter(
        ({ analysis }) =>
          analysis.changed && !hasChangedNestedTable(analysis, analyses),
      );
    if (deepest.length === 0) {
      summary.formattingPassesUsed = pass;
      return finalize(output);
    }
    for (const { analysis, index } of deepest.sort(
      (a, b) => b.analysis.start - a.analysis.start,
    )) {
      output =
        output.slice(0, analysis.start) +
        analysis.value +
        output.slice(analysis.end);
      changedNodeIndices.add(index);
    }
    summary.formattingPassesUsed = pass + 1;
  }

  summary.convergenceLimitReached = true;
  changedNodeIndices.clear();
  diagnostics = diagnostics.map((diagnostic) => ({
    ...diagnostic,
    changed: false,
    ambiguous: true,
    reason: "table formatting did not converge within 64 parser passes",
  }));
  summary.tablesEligible = summary.tablesInspected;
  summary.tablesSkippedAmbiguous = summary.tablesInspected;
  return finalize(source);
}

export function formatTablesWithDiagnostics(
  source: string,
  config: Config,
  options: ResolvedFormatOptions,
  context?: ParsedDocumentContext,
): TableFormatWithDiagnosticsResult {
  return formatParserTables(source, config, options, context);
}

export function formatTables(
  source: string,
  config: Config,
  options: ResolvedFormatOptions,
): string {
  return formatTablesWithDiagnostics(source, config, options).formatted;
}

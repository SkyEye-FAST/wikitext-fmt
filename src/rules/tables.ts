import type { Config } from "wikiparser-node";
import type {
  ResolvedFormatOptions,
  TableCellSeparatorStyle,
} from "../options.js";
import {
  createParserContext,
  type ParsedDocumentContext,
} from "../parserContext.js";

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
      separatorStyleReason: string;
      lineDiagnostics: TableLineDiagnostic[];
    }
  | {
      changed: false;
      reason: string;
      separatorStyle?: Exclude<TableCellSeparatorStyle, "auto">;
      separatorStyleReason?: string;
      lineDiagnostics?: TableLineDiagnostic[];
    };

export interface TableDiagnostic {
  start: number;
  end: number;
  line: number;
  changed: boolean;
  reason?: string;
  separatorStyle?: Exclude<TableCellSeparatorStyle, "auto">;
  separatorStyleReason?: string;
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

interface InlineScanPosition {
  index: number;
  quote?: '"' | "'";
  templateDepth: number;
  wikilinkDepth: number;
  externalLinkDepth: number;
}

// Hybrid table formatting note:
// wikiparser-node is still the authority for finding standalone table nodes and
// their source ranges. The parser exposes table cell tokens for many cases, but
// it currently treats `||` inside some wikilink/external-link labels as table
// separators. This fallback tokenizer is intentionally limited to top-level
// table-cell separator detection inside a parser-confirmed table line. It is
// not a general wikitext parser.
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
    if (
      character === "[" &&
      content[index + 1] !== "[" &&
      wikilinkDepth === 0
    ) {
      externalLinkDepth++;
      continue;
    }
    if (
      character === "]" &&
      content[index + 1] !== "]" &&
      wikilinkDepth === 0
    ) {
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

function splitSimpleCells(
  content: string,
  separator: "!!" | "||",
): string[] | undefined {
  const parts: string[] = [];
  let start = 0;

  const balanced = scanTopLevelTableCellText(
    content,
    ({ index }) => {
      if (content.startsWith(separator, index)) {
        parts.push(content.slice(start, index).trimEnd());
        start = index + separator.length;
      }
      return true;
    },
    ({ index }) => !content.startsWith(separator, index),
  );

  if (!balanced) return undefined;
  parts.push(content.slice(start).trimEnd());
  return parts.some((part) => part.trim() === "") ? undefined : parts;
}

function lineRiskReason(line: string): string | undefined {
  if (/<[a-z!/]/iu.test(line)) return "contains HTML or extension tag";
  if (/[{}]/u.test(line)) return "contains ambiguous brace syntax";
  return undefined;
}

function cellLineRiskReason(line: string): string | undefined {
  void line;
  return undefined;
}

function formatStructuralLine(
  line: string,
  value: string,
  riskContent = line,
): TableLineFormatResult {
  const reason = lineRiskReason(riskContent);
  if (reason) return { changed: false, value: line, reason };
  return value === line
    ? { changed: false, value: line }
    : { changed: true, value };
}

function formatCellLine(
  line: string,
  content: string,
  marker: "!" | "|",
  separatorStyle: Exclude<TableCellSeparatorStyle, "auto">,
  hasContinuation = false,
): TableLineFormatResult {
  if (hasContinuation) {
    return {
      changed: false,
      value: line,
      reason: "cell has continuation line",
    };
  }
  const reason = cellLineRiskReason(line);
  if (reason) return { changed: false, value: line, reason };
  const separator = marker === "!" ? "!!" : "||";
  const attributes = analyzeCellAttributesForTesting(content, separator);
  if (!attributes.isSafe) {
    return {
      changed: false,
      value: line,
      reason: "uncertain cell attribute prefix",
    };
  }
  if (attributes.hasUnsafeSeparator) {
    return {
      changed: false,
      value: line,
      reason: "unsafe separator in quoted cell attributes",
    };
  }
  const cells = splitSimpleCells(content, separator);
  if (!cells) {
    return {
      changed: false,
      value: line,
      reason:
        marker === "!"
          ? "unsafe header cell separator"
          : "unsafe data cell separator",
    };
  }
  const value =
    separatorStyle === "split"
      ? cells.map((cell) => `${marker}${cell}`).join("\n")
      : `${marker}${content.trimEnd()}`;
  return value === line
    ? { changed: false, value: line }
    : { changed: true, value };
}

export interface CellAttributeAnalysis {
  hasAttributes: boolean;
  hasUnsafeSeparator: boolean;
  isSafe: boolean;
  attributePrefix?: string;
}

export function analyzeCellAttributesForTesting(
  content: string,
  _separator: "!!" | "||",
): CellAttributeAnalysis {
  let delimiter = -1;
  let hasUnsafeSeparator = false;
  const balanced = scanTopLevelTableCellText(
    content,
    ({ index }) => {
      const character = content[index]!;
      if (
        character === "|" &&
        content[index - 1] !== "|" &&
        content[index + 1] !== "|"
      ) {
        delimiter = index;
        return false;
      }
      return true;
    },
    ({ index }) => {
      if (content.startsWith("||", index) || content.startsWith("!!", index))
        hasUnsafeSeparator = true;
      return true;
    },
  );
  if (!balanced && delimiter < 0)
    return { hasAttributes: false, hasUnsafeSeparator, isSafe: false };
  if (delimiter < 0)
    return { hasAttributes: false, hasUnsafeSeparator: false, isSafe: true };

  const attributes = content.slice(0, delimiter);
  const valid =
    /^\s*(?:[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`|]+)\s*)+$/u.test(
      attributes,
    );
  if (!valid)
    return { hasAttributes: false, hasUnsafeSeparator, isSafe: false };
  return {
    hasAttributes: true,
    hasUnsafeSeparator,
    isSafe: true,
    attributePrefix: content.slice(0, delimiter + 1),
  };
}

function detectTableCellSeparatorStyle(
  _lines: readonly string[],
  options: Pick<ResolvedFormatOptions, "lineWidth" | "tableCellSeparatorStyle">,
  _continuedCellLines: ReadonlySet<number>,
): { style: Exclude<TableCellSeparatorStyle, "auto">; reason: string } {
  if (options.tableCellSeparatorStyle === "split") {
    return { style: "split", reason: "explicit split option" };
  }
  if (options.tableCellSeparatorStyle === "preserve") {
    return { style: "preserve", reason: "explicit preserve option" };
  }

  return {
    style: "split",
    reason: "aggressive auto splits every parser-confirmed multi-cell row",
  };
}

function isCommentLine(line: string): boolean {
  return /^\s*<!--[\s\S]*-->\s*$/u.test(line);
}

function analyzeContinuationLines(
  lines: readonly string[],
):
  | { continuedCellLines: Set<number>; continuationLines: Set<number> }
  | { reason: string } {
  const continuedCellLines = new Set<number>();
  const continuationLines = new Set<number>();
  let openCellLine: number | undefined;

  for (let index = 1; index < lines.length - 1; index++) {
    const line = lines[index]!;
    if (isCommentLine(line)) continue;
    if (/^\s*!/u.test(line) || /^\s*\|(?![-+\}])/u.test(line)) {
      openCellLine = index;
      continue;
    }
    if (/^\s*\|[-+]/u.test(line)) {
      openCellLine = undefined;
      continue;
    }
    if (openCellLine === undefined) {
      return { reason: `unclear table line type at line ${index + 1}` };
    }
    continuedCellLines.add(openCellLine);
    continuationLines.add(index);
  }
  return { continuedCellLines, continuationLines };
}

export function analyzeSimpleTableForTesting(
  raw: string,
  options: Pick<
    ResolvedFormatOptions,
    "lineWidth" | "tableCellSeparatorStyle"
  > = {
    lineWidth: 120,
    tableCellSeparatorStyle: "auto",
  },
): TableAnalysisResult {
  if (/\uE000wikitext-fmt:/u.test(raw))
    return { changed: false, reason: "contains protected placeholder" };
  const lines = raw.split("\n");
  if (
    lines.length < 2 ||
    !/^\s*\{\|/u.test(lines[0]!) ||
    !/^\s*\|\}\s*$/u.test(lines.at(-1)!)
  ) {
    return { changed: false, reason: "unbalanced table start or end" };
  }
  if (lines.slice(1).some((line) => /^\s*\{\|/u.test(line))) {
    return { changed: false, reason: "contains nested table" };
  }
  const continuationAnalysis = analyzeContinuationLines(lines);
  if ("reason" in continuationAnalysis)
    return { changed: false, reason: continuationAnalysis.reason };

  const separatorDecision = detectTableCellSeparatorStyle(
    lines,
    options,
    continuationAnalysis.continuedCellLines,
  );
  const separatorStyle = separatorDecision.style;

  const output: string[] = [];
  const lineDiagnostics: TableLineDiagnostic[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    let result: TableLineFormatResult;
    if (index === 0) {
      const attributes = line.replace(/^\s*\{\|/u, "");
      result = formatStructuralLine(
        line,
        `{|${attributes.trimEnd()}`,
        attributes,
      );
    } else if (index === lines.length - 1) {
      result = formatStructuralLine(line, "|}", "");
    } else if (/^\s*\|-/u.test(line) || /^\s*\|\+/u.test(line)) {
      result = formatStructuralLine(line, line.trimEnd());
    } else if (isCommentLine(line)) {
      result = { changed: false, value: line };
    } else if (continuationAnalysis.continuationLines.has(index)) {
      result = {
        changed: false,
        value: line,
        reason: "continuation line preserved",
      };
    } else {
      const header = /^\s*!(.*)$/u.exec(line);
      const data = /^\s*\|(?![-+}])(.*)$/u.exec(line);
      result = header
        ? formatCellLine(
            line,
            header[1]!,
            "!",
            separatorStyle,
            continuationAnalysis.continuedCellLines.has(index),
          )
        : formatCellLine(
            line,
            data![1]!,
            "|",
            separatorStyle,
            continuationAnalysis.continuedCellLines.has(index),
          );
    }
    output.push(result.value);
    lineDiagnostics.push({
      tableLine: index + 1,
      changed: result.changed,
      ...(result.changed || !result.reason ? {} : { reason: result.reason }),
    });
  }
  const value = output.join("\n");
  if (value !== raw) {
    return {
      changed: true,
      value,
      separatorStyle,
      separatorStyleReason: separatorDecision.reason,
      lineDiagnostics,
    };
  }
  const skipped = lineDiagnostics.find((diagnostic) => diagnostic.reason);
  return {
    changed: false,
    reason: skipped?.reason ?? "already formatted",
    separatorStyle,
    separatorStyleReason: separatorDecision.reason,
    lineDiagnostics,
  };
}

export interface ParserTableNode {
  type: string;
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
  diagnostic: TableDiagnostic;
}

function nearestTable(node: ParserTableNode | undefined): ParserTableNode | undefined {
  let current = node;
  while (current && current.type !== "table") current = current.parentNode;
  return current;
}

function protectedTableRanges(
  table: ParserTableNode,
  tableStart: number,
): SourceRange[] {
  const selectors = ["ext", "comment", "table"];
  const ranges: SourceRange[] = [];
  for (const selector of selectors) {
    for (const node of table.querySelectorAll<ParserTableNode>(selector)) {
      if (node === table) continue;
      const start = node.getAbsoluteIndex() - tableStart;
      ranges.push({ start, end: start + node.toString().length });
    }
  }
  return ranges;
}

interface SourceRange {
  start: number;
  end: number;
}

function positionIsProtected(position: number, ranges: readonly SourceRange[]): boolean {
  return ranges.some((range) => position >= range.start && position < range.end);
}

function lexicalSeparatorPositions(
  raw: string,
  protectedRanges: readonly SourceRange[],
): number[] {
  const positions: number[] = [];
  let lineStart = 0;
  while (lineStart < raw.length) {
    const newline = raw.indexOf("\n", lineStart);
    const lineEnd = newline < 0 ? raw.length : newline;
    const line = raw.slice(lineStart, lineEnd);
    const match = /^[\t ]*[!|](?![-+}])/u.exec(line);
    if (match) {
      const contentStart = match[0].length;
      const content = line.slice(contentStart);
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
      );
    }
    if (newline < 0) break;
    lineStart = newline + 1;
  }
  return [...new Set(positions)].sort((a, b) => a - b);
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
      if (raw !== "!!" && raw !== "||") return [];
      return [syntax.getAbsoluteIndex() - tableStart];
    })
    .sort((a, b) => a - b);
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function tableLineAt(raw: string, position: number): number {
  return lineNumberAt(raw, position);
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
  const style =
    options.tableCellSeparatorStyle === "preserve" ? "preserve" : "split";
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
      diagnostic: {
        start,
        end,
        line,
        changed: false,
        reason: "inline cell separators explicitly preserved",
        separatorStyle: style,
        separatorStyleReason,
      },
    };
  }

  const parserPositions = parserSeparatorPositions(table);
  const fallbackPositions = lexicalSeparatorPositions(
    raw,
    protectedTableRanges(table, localStart),
  );
  const parserBoundariesReliable = arraysEqual(parserPositions, fallbackPositions);
  const positions = parserBoundariesReliable ? parserPositions : fallbackPositions;
  let value = raw;
  for (const position of [...positions].sort((a, b) => b - a)) {
    const marker = raw[position] === "!" ? "!" : "|";
    const prefix = value.slice(0, position).replace(/[\t ]+$/u, "");
    value = `${prefix}\n${marker}${value.slice(position + 2)}`;
  }
  const lineDiagnostics: TableLineDiagnostic[] = [
    ...new Set(positions.map((position) => tableLineAt(raw, position))),
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
    diagnostic: {
      start,
      end,
      line,
      changed,
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

  // Parser-order defect fallback: wikiparser-node does not expose table nodes
  // inside template parameter text. Reparse only at an exact table opener and
  // accept the range only when the parser confirms a closed table at offset 0.
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

  for (let pass = 0; pass < maxPasses; pass++) {
    const current = firstContext ?? createParserContext(output, config);
    firstContext = undefined;
    const tables = collectParserTableCandidates(output, current, config);
    const analyses = tables.map(({ node, offset }) =>
      analyzeParserTable(output, node, offset, options),
    );
    if (pass === 0) diagnostics = analyses.map(({ diagnostic }) => diagnostic);
    const deepest = analyses.filter(
      (analysis) =>
        analysis.changed && !hasChangedNestedTable(analysis, analyses),
    );
    if (deepest.length === 0) return { formatted: output, diagnostics };

    for (const analysis of deepest.sort((a, b) => b.start - a.start)) {
      output =
        output.slice(0, analysis.start) +
        analysis.value +
        output.slice(analysis.end);
      const index = analyses.indexOf(analysis);
      diagnostics[index] = analysis.diagnostic;
    }
  }

  return {
    formatted: source,
    diagnostics: diagnostics.map((diagnostic) => ({
      ...diagnostic,
      changed: false,
      reason: "table formatting did not converge within 64 parser passes",
    })),
  };
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

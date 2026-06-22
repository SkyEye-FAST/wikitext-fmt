import type { Config } from "wikiparser-node";
import type {
  ResolvedFormatOptions,
  TableCellSeparatorStyle,
} from "../options.js";
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

function scanInlineStructures(
  content: string,
  onTopLevel: (position: InlineScanPosition) => boolean,
  onInsideQuote?: (position: InlineScanPosition) => boolean,
): boolean {
  let templateDepth = 0;
  let wikilinkDepth = 0;
  let externalLinkDepth = 0;
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < content.length; index++) {
    const character = content[index]!;

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

  const balanced = scanInlineStructures(
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

function containsBalancedTemplate(content: string): boolean {
  if (!content.includes("{{")) return false;
  return scanInlineStructures(
    content,
    () => true,
    () => true,
  );
}

function lineRiskReason(line: string): string | undefined {
  if (/<[a-z!/]/iu.test(line)) return "contains HTML or extension tag";
  if (/[{}]/u.test(line)) return "contains ambiguous brace syntax";
  return undefined;
}

function cellLineRiskReason(line: string): string | undefined {
  if (/<[a-z!/]/iu.test(line)) return "contains HTML or extension tag";
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
  const balanced = scanInlineStructures(
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
  lines: readonly string[],
  options: Pick<ResolvedFormatOptions, "lineWidth" | "tableCellSeparatorStyle">,
  continuedCellLines: ReadonlySet<number>,
): { style: Exclude<TableCellSeparatorStyle, "auto">; reason: string } {
  if (options.tableCellSeparatorStyle === "split") {
    return { style: "split", reason: "explicit split option" };
  }
  if (options.tableCellSeparatorStyle === "preserve") {
    return { style: "preserve", reason: "explicit preserve option" };
  }

  const cellLines = lines
    .slice(1, -1)
    .map((line, index) => {
      const tableLineIndex = index + 1;
      const header = /^\s*!(.*)$/u.exec(line);
      const data = /^\s*\|(?![-+\}])(.*)$/u.exec(line);
      if (!header && !data) return undefined;
      const marker = header ? "!" : "|";
      const content = (header ?? data)![1]!;
      const attributeAnalysis = analyzeCellAttributesForTesting(
        content,
        marker === "!" ? "!!" : "||",
      );
      if (
        cellLineRiskReason(line) ||
        continuedCellLines.has(tableLineIndex) ||
        !attributeAnalysis.isSafe ||
        attributeAnalysis.hasUnsafeSeparator
      ) {
        return { index, marker, content, safe: false as const };
      }
      const cells = splitSimpleCells(content, marker === "!" ? "!!" : "||");
      return cells
        ? { index, marker, content, cells, safe: true as const }
        : { index, marker, content, safe: false as const };
    })
    .filter((line) => line !== undefined);

  const safeLines = cellLines.filter((line) => line.safe);
  const maximumCellCount = Math.max(
    1,
    ...safeLines.map((line) => line.cells.length),
  );
  const hasAttributes = cellLines.some(
    (line) =>
      analyzeCellAttributesForTesting(
        line.content,
        line.marker === "!" ? "!!" : "||",
      ).hasAttributes,
  );
  const hasLongInlineLine = safeLines.some(
    (line) =>
      line.cells.length > 1 &&
      lines[line.index + 1]!.length > options.lineWidth,
  );
  const inlineLineCount = safeLines.filter(
    (line) => line.cells.length > 1,
  ).length;
  const hasBalancedTemplateCells = safeLines.some(
    (line) => line.cells.length > 1 && containsBalancedTemplate(line.content),
  );
  const hasUnsafeRows = cellLines.some((line) => !line.safe);
  const hasSplitLines = safeLines.some((line, index) => {
    if (line.cells.length !== 1) return false;
    const previous = safeLines[index - 1];
    const next = safeLines[index + 1];
    return (
      (previous?.index === line.index - 1 &&
        previous.marker === line.marker &&
        previous.cells.length === 1) ||
      (next?.index === line.index + 1 &&
        next.marker === line.marker &&
        next.cells.length === 1)
    );
  });

  if (hasAttributes) return { style: "split", reason: "cell attributes" };
  if (maximumCellCount >= 4) return { style: "split", reason: "many columns" };
  if (hasLongInlineLine)
    return { style: "split", reason: "line exceeds lineWidth" };
  if (hasBalancedTemplateCells)
    return { style: "split", reason: "balanced template cells" };
  if (hasSplitLines && inlineLineCount > 0) {
    return { style: "split", reason: "mixed inline and split style" };
  }
  if (hasSplitLines) return { style: "split", reason: "already mostly split" };
  if (hasUnsafeRows && inlineLineCount > 0)
    return { style: "split", reason: "contains skipped unsafe rows" };
  if (cellLines.length >= 12)
    return { style: "split", reason: "many table rows" };
  return { style: "preserve", reason: "simple compact inline table" };
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
    const hasSkippedUnsafeLines =
      result.changed &&
      lineDiagnostics?.some((diagnostic) => diagnostic.reason);
    diagnostics.push({
      start,
      end,
      line: startLine,
      changed: result.changed,
      ...(result.changed
        ? hasSkippedUnsafeLines
          ? { reason: "formatted with skipped unsafe lines" }
          : {}
        : { reason: result.reason }),
      ...(result.separatorStyle
        ? { separatorStyle: result.separatorStyle }
        : {}),
      ...(result.separatorStyleReason
        ? { separatorStyleReason: result.separatorStyleReason }
        : {}),
      ...(lineDiagnostics ? { lineDiagnostics } : {}),
    });
    if (result.changed) replacements.push({ start, end, value: result.value });
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, replacement.start) +
      replacement.value +
      output.slice(replacement.end);
  }
  return { formatted: output, diagnostics };
}

export function formatTables(
  source: string,
  config: Config,
  options: ResolvedFormatOptions,
): string {
  return formatTablesWithDiagnostics(source, config, options).formatted;
}

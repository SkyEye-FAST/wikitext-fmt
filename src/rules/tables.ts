import type {
  ResolvedFormatOptions,
  TableCellSeparatorStyle,
} from "../options.js";
import type { ParsedDocumentContext } from "../parserContext.js";
import { semanticRangeIdentities } from "../semanticIdentity.js";

export interface TableLineDiagnostic {
  tableLine: number;
  sourceLine?: number;
  changed: boolean;
  reason?: string;
}

export interface TableDiagnostic {
  semanticId?: string;
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
  tableSemanticIds: string[];
  changedTableSemanticIds: string[];
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

export interface ParserTableCandidateStats {
  openerCount: number;
  rootCandidates: number;
  fallbackParses: number;
  fallbackSourceBytes: number;
  coveredOpeners: number;
}

export interface ParserTableAnalysisProfile {
  index: number;
  start: number;
  bytes: number;
  milliseconds: number;
  changed: boolean;
  eligible: boolean;
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
  unbalancedLines: number[];
}

interface TableSourceReplacement {
  start: number;
  end: number;
  value: string;
  tableLine: number;
  reason: string;
}

interface ConfirmedInlineSeparator {
  position: number;
  marker: "!" | "|";
}

interface ConfirmedInlineSeparators {
  separators: ConfirmedInlineSeparator[];
  parserBoundariesReliable: boolean;
  balanced: boolean;
  unbalancedLines: number[];
}

export interface ConfirmedTableInlineSeparatorLayout {
  separatorPositions: number[];
  cellEnds: ReadonlyMap<ParserTableNode, number>;
}

interface TableCellLayoutShape {
  cellRange: SourceRange;
  attributes?: {
    range: SourceRange;
    value: string;
  };
  content: {
    range: SourceRange;
    value: string;
  };
  isCaption: boolean;
}

interface TableCellSourceRange {
  cell: ParserTableNode;
  cellRange: SourceRange;
  syntax: {
    range: SourceRange;
    value: string;
  };
  attributes: {
    node: ParserTableNode;
    range: SourceRange;
    value: string;
  };
  content: {
    node: ParserTableNode;
    range: SourceRange;
    value: string;
  };
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
    tableSemanticIds: [],
    changedTableSemanticIds: [],
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
  quotedAttributeEnd = -1,
): boolean {
  let templateDepth = 0;
  let wikilinkDepth = 0;
  let wikilinkBracketDepth = 0;
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
    if (
      index < quotedAttributeEnd &&
      (character === '"' || character === "'")
    ) {
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
    if (character === "[" && wikilinkDepth > 0) {
      wikilinkBracketDepth++;
      continue;
    }
    if (
      character === "]" &&
      wikilinkDepth > 0 &&
      wikilinkBracketDepth > 0
    ) {
      wikilinkBracketDepth--;
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
    wikilinkBracketDepth === 0 &&
    externalLinkDepth === 0
  );
}

function topLevelAttributeDelimiter(
  content: string,
  isProtected?: (index: number) => boolean,
): number {
  let templateDepth = 0;
  let wikilinkDepth = 0;
  let wikilinkBracketDepth = 0;
  let externalLinkDepth = 0;
  let delimiter = -1;
  for (let index = 0; index < content.length; index++) {
    if (isProtected?.(index)) continue;
    if (content.startsWith("{{", index)) {
      templateDepth++;
      index++;
      continue;
    }
    if (content.startsWith("}}", index)) {
      templateDepth = Math.max(0, templateDepth - 1);
      index++;
      continue;
    }
    if (content.startsWith("[[", index)) {
      wikilinkDepth++;
      index++;
      continue;
    }
    const character = content[index]!;
    if (character === "[" && wikilinkDepth > 0) {
      wikilinkBracketDepth++;
      continue;
    }
    if (
      character === "]" &&
      wikilinkDepth > 0 &&
      wikilinkBracketDepth > 0
    ) {
      wikilinkBracketDepth--;
      continue;
    }
    if (content.startsWith("]]", index)) {
      wikilinkDepth = Math.max(0, wikilinkDepth - 1);
      index++;
      continue;
    }
    if (character === "[" && content[index + 1] !== "[" && wikilinkDepth === 0) {
      externalLinkDepth++;
      continue;
    }
    if (character === "]" && content[index + 1] !== "]" && wikilinkDepth === 0) {
      externalLinkDepth = Math.max(0, externalLinkDepth - 1);
      continue;
    }
    if (
      character === "|" &&
      content[index - 1] !== "|" &&
      content[index + 1] !== "|" &&
      templateDepth === 0 &&
      wikilinkDepth === 0 &&
      externalLinkDepth === 0
    ) {
      delimiter = index;
    }
  }
  return delimiter;
}

function protectedTableRanges(
  table: ParserTableNode,
  raw: string,
): SourceRange[] {
  const ranges: SourceRange[] = [];
  // Multiline templates can put parameter pipes at the start of physical
  // table lines. Keep every parser-confirmed opaque node out of the lexical
  // separator fallback instead of requiring its delimiters to balance per line.
  for (const selector of [
    "ext",
    "comment",
    "table",
    "template",
    "magic-word",
  ]) {
    let cursor = 0;
    for (const node of table.querySelectorAll<ParserTableNode>(selector)) {
      if (node === table) continue;
      const nodeRaw = node.toString();
      if (!nodeRaw) continue;
      const start = raw.indexOf(nodeRaw, cursor);
      if (start < 0) continue;
      ranges.push({ start, end: start + nodeRaw.length });
      cursor = start + nodeRaw.length;
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: SourceRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function positionIsProtected(
  position: number,
  ranges: readonly SourceRange[],
): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle]!;
    if (position < range.start) high = middle - 1;
    else if (position >= range.end) low = middle + 1;
    else return true;
  }
  return false;
}

function lexicalSeparatorPositions(
  raw: string,
  protectedRanges: readonly SourceRange[],
): LexicalSeparators {
  const positions: number[] = [];
  let balanced = true;
  const unbalancedLines: number[] = [];
  let lineStart = 0;
  let tableLine = 1;
  while (lineStart < raw.length) {
    const newline = raw.indexOf("\n", lineStart);
    const lineEnd = newline < 0 ? raw.length : newline;
    const line = raw.slice(lineStart, lineEnd);
    const match = /^[\t ]*[!|](?![-+}])/u.exec(line);
    if (match) {
      const contentStart = match[0].length;
      const content = line.slice(contentStart);
      const isProtected = (index: number): boolean =>
        positionIsProtected(
          lineStart + contentStart + index,
          protectedRanges,
        );
      const lineBalanced = scanTopLevelTableCellText(
        content,
        ({ index }) => {
          if (content.startsWith("!!", index) || content.startsWith("||", index)) {
            positions.push(lineStart + contentStart + index);
          }
          return true;
        },
        () => true,
        isProtected,
        topLevelAttributeDelimiter(content, isProtected),
      );
      if (!lineBalanced) unbalancedLines.push(tableLine);
      balanced = lineBalanced && balanced;
    }
    if (newline < 0) break;
    lineStart = newline + 1;
    tableLine++;
  }
  return {
    positions: [...new Set(positions)].sort((a, b) => a - b),
    balanced,
    unbalancedLines,
  };
}

function parserSeparators(
  cells: readonly TableCellSourceRange[],
): Array<{ position: number; marker: "!" | "|" }> {
  const separators: Array<{ position: number; marker: "!" | "|" }> = [];
  for (const cell of cells) {
    const syntaxRaw = cell.syntax.value;
    if (syntaxRaw === "!!" || syntaxRaw === "||") {
      separators.push({
        position: cell.syntax.range.start,
        marker: syntaxRaw === "!!" ? "!" : "|",
      });
    }
  }
  return separators;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function directTableCells(table: ParserTableNode): ParserTableNode[] {
  const cells: ParserTableNode[] = [];
  for (const child of table.childNodes) {
    if (child.type === "td") {
      cells.push(child);
      continue;
    }
    if (child.type === "tr") {
      cells.push(
        ...child.childNodes.filter((node) => node.type === "td"),
      );
    }
  }
  return cells;
}

function tableCellSourceRanges(
  table: ParserTableNode,
  raw: string,
): TableCellSourceRange[] {
  const ranges: TableCellSourceRange[] = [];
  let cursor = 0;
  for (const cell of directTableCells(table)) {
    const syntax = cell.childNodes[0];
    const attributes = cell.childNodes[1];
    const content = cell.childNodes[2];
    if (
      !syntax ||
      !attributes ||
      !content ||
      syntax.type !== "table-syntax" ||
      attributes.type !== "table-attrs" ||
      content.type !== "td-inner"
    ) {
      continue;
    }
    const syntaxValue = syntax.toString();
    const attributesValue = attributes.toString();
    const contentValue = content.toString();
    const sourceValue = `${syntaxValue}${attributesValue}${
      attributesValue ? "|" : ""
    }${contentValue}`;
    const start = raw.indexOf(sourceValue, cursor);
    if (start < 0) continue;
    const syntaxRange = { start, end: start + syntaxValue.length };
    const attributesRange = {
      start: syntaxRange.end,
      end: syntaxRange.end + attributesValue.length,
    };
    const contentRange = {
      start: start + sourceValue.length - contentValue.length,
      end: start + sourceValue.length,
    };
    ranges.push({
      cell,
      cellRange: { start, end: contentRange.end },
      syntax: { range: syntaxRange, value: syntaxValue },
      attributes: {
        node: attributes,
        range: attributesRange,
        value: attributesValue,
      },
      content: { node: content, range: contentRange, value: contentValue },
    });
    cursor = contentRange.end;
  }
  return ranges;
}

function hasParserConfirmedAttributes(node: ParserTableNode | undefined): boolean {
  return (
    node?.type === "table-attrs" &&
    node.childNodes.some((child) => child.type === "table-attr")
  );
}

function tableLineAt(raw: string, position: number): number {
  return lineNumberAt(raw, position);
}

function removeLeadingLayoutSpace(value: string): string {
  return value.startsWith(" ") ? value.slice(1) : value;
}

function removeTrailingLayoutSpace(value: string): string {
  return value.endsWith(" ") ? value.slice(0, -1) : value;
}

function renderCellContent(content: string): string {
  if (!content) return "";
  const withoutLayoutSpace = removeLeadingLayoutSpace(content);
  return withoutLayoutSpace ? ` ${withoutLayoutSpace}` : "";
}

function renderCellAttributes(attributes: string): string {
  const withoutLayoutSpaces = removeTrailingLayoutSpace(
    removeLeadingLayoutSpace(attributes),
  );
  return ` ${withoutLayoutSpaces} `;
}

function renderLineAttributes(attributes: string): string {
  return ` ${removeLeadingLayoutSpace(attributes)}`;
}

function attributePrefixReplacement(
  syntax: ParserTableNode | undefined,
  attributes: ParserTableNode | undefined,
  raw: string,
  searchStart: number,
  reason: string,
): { replacement?: TableSourceReplacement; nextSearchStart: number } {
  if (!syntax || !attributes || !hasParserConfirmedAttributes(attributes)) {
    return { nextSearchStart: searchStart };
  }
  const syntaxValue = syntax.toString();
  const attributesValue = attributes.toString();
  const syntaxStart = raw.indexOf(`${syntaxValue}${attributesValue}`, searchStart);
  if (syntaxStart < 0) return { nextSearchStart: searchStart };
  const attributesStart = syntaxStart + syntaxValue.length;
  const value = renderLineAttributes(attributesValue);
  const nextSearchStart = attributesStart + attributesValue.length;
  if (value === attributesValue) return { nextSearchStart };
  return {
    replacement: {
      start: attributesStart,
      end: nextSearchStart,
      value,
      tableLine: tableLineAt(raw, attributesStart),
      reason,
    },
    nextSearchStart,
  };
}

function tableOpenerLayoutReplacements(
  table: ParserTableNode,
  raw: string,
): TableSourceReplacement[] {
  const { replacement } = attributePrefixReplacement(
    table.childNodes[0],
    table.childNodes[1],
    raw,
    0,
    "normalized table opener attribute layout",
  );
  return replacement ? [replacement] : [];
}

function rowLayoutReplacements(
  table: ParserTableNode,
  raw: string,
): TableSourceReplacement[] {
  const replacements: TableSourceReplacement[] = [];
  let cursor = 0;
  for (const row of table.childNodes.filter((node) => node.type === "tr")) {
    const { replacement, nextSearchStart } = attributePrefixReplacement(
      row.childNodes[0],
      row.childNodes[1],
      raw,
      cursor,
      "normalized table row attribute layout",
    );
    cursor = nextSearchStart;
    if (replacement) replacements.push(replacement);
  }
  return replacements;
}

function hasNestedTable(node: ParserTableNode): boolean {
  const descendants = [...node.childNodes];
  for (let index = 0; index < descendants.length; index++) {
    const descendant = descendants[index]!;
    if (descendant.type === "table") return true;
    descendants.push(...descendant.childNodes);
  }
  return false;
}

function tableCellLayoutShape(
  cell: TableCellSourceRange,
  raw: string,
): TableCellLayoutShape | undefined {
  const syntaxValue = cell.syntax.value;
  const isCaption = /\|\+$/u.test(syntaxValue);
  if (
    isCaption
      ? !/\n[\t ]*\|\+$/u.test(syntaxValue)
      : !/\n[\t ]*[!|]$/u.test(syntaxValue)
  ) {
    return undefined;
  }
  if (hasNestedTable(cell.content.node)) {
    return undefined;
  }
  const shape: TableCellLayoutShape = {
    cellRange: cell.cellRange,
    content: {
      range: cell.content.range,
      value: cell.content.value,
    },
    isCaption,
  };
  if (hasParserConfirmedAttributes(cell.attributes.node)) {
    if (
      raw.slice(cell.attributes.range.end, cell.content.range.start) !== "|"
    ) {
      return undefined;
    }
    shape.attributes = {
      range: cell.attributes.range,
      value: cell.attributes.value,
    };
  }
  return shape;
}

function standaloneCellLayoutReplacements(
  cells: readonly TableCellSourceRange[],
  raw: string,
  cellsBeforeSplitSeparators: ReadonlySet<number>,
): TableSourceReplacement[] {
  const replacements: TableSourceReplacement[] = [];
  for (const cell of cells) {
    const shape = tableCellLayoutShape(cell, raw);
    if (!shape || cellsBeforeSplitSeparators.has(shape.cellRange.end)) continue;
    const reason = shape.isCaption
      ? "normalized table caption layout"
      : "normalized standalone table cell layout";
    if (shape.attributes) {
      const value = `${renderCellAttributes(shape.attributes.value)}|${renderCellContent(
        shape.content.value,
      )}`;
      const start = shape.attributes.range.start;
      const end = shape.content.range.end;
      if (raw.slice(start, end) !== value) {
        replacements.push({
          start,
          end,
          value,
          tableLine: tableLineAt(raw, start),
          reason,
        });
      }
      continue;
    }
    const value = renderCellContent(shape.content.value);
    if (value !== shape.content.value) {
      replacements.push({
        start: shape.content.range.start,
        end: shape.content.range.end,
        value,
        tableLine: tableLineAt(raw, shape.content.range.start),
        reason,
      });
    }
  }
  return replacements;
}

function confirmedInlineSeparators(
  table: ParserTableNode,
  raw: string,
  cells = tableCellSourceRanges(table, raw),
): ConfirmedInlineSeparators {
  const parserConfirmed = parserSeparators(cells);
  const parserPositions = parserConfirmed.map(({ position }) => position);
  // Most ordinary tables have no opaque syntax. Avoid repeatedly walking the
  // parser subtree for protected ranges when the inexpensive lexical pass
  // already confirms every parser boundary. A disagreement is the only case
  // that needs the parser-owned opaque ranges for a fail-closed decision.
  let lexical = lexicalSeparatorPositions(raw, []);
  let parserBoundariesReliable = arraysEqual(
    parserPositions,
    lexical.positions,
  );
  if (!parserBoundariesReliable) {
    lexical = lexicalSeparatorPositions(
      raw,
      protectedTableRanges(table, raw),
    );
    parserBoundariesReliable = arraysEqual(
      parserPositions,
      lexical.positions,
    );
  }
  if (!parserBoundariesReliable && !lexical.balanced) {
    return {
      separators: [],
      parserBoundariesReliable,
      balanced: false,
      unbalancedLines: lexical.unbalancedLines,
    };
  }
  const confirmedPositions = parserBoundariesReliable
    ? parserPositions
    : lexical.positions;
  const parserMarkers = new Map(
    parserConfirmed.map(({ position, marker }) => [position, marker]),
  );
  const separators = confirmedPositions
    .map((position) => ({
      position,
      marker: parserBoundariesReliable
        ? (parserMarkers.get(position) ?? (raw[position] === "!" ? "!" : "|"))
        : raw[position] === "!"
          ? ("!" as const)
          : ("|" as const),
    }))
    .filter(
      ({ position, marker }) =>
        !(
          marker === "|" &&
          (raw[position - 1] === "|" ||
            /[-+}|]/u.test(raw[position + 2] ?? ""))
        ) &&
        !(
          marker === "!" &&
          (raw[position - 1] === "!" || raw[position + 2] === "!")
        ),
    );
  return {
    separators,
    parserBoundariesReliable,
    balanced: true,
    unbalancedLines: lexical.unbalancedLines,
  };
}

export function confirmedTableInlineSeparatorLayout(
  table: ParserTableNode,
): ConfirmedTableInlineSeparatorLayout {
  const raw = table.toString();
  const cells = tableCellSourceRanges(table, raw);
  const separatorPositions = confirmedInlineSeparators(
    table,
    raw,
    cells,
  ).separators.map(({ position }) => position);
  const positions = new Set(separatorPositions);
  return {
    separatorPositions,
    cellEnds: new Map(
      cells
        .filter(({ cellRange }) => positions.has(cellRange.end))
        .map(({ cell, cellRange }) => [cell, cellRange.end]),
    ),
  };
}

export function confirmedTableInlineSeparatorPositions(
  table: ParserTableNode,
): number[] {
  return confirmedTableInlineSeparatorLayout(table).separatorPositions;
}

function tableLayoutReplacements(
  table: ParserTableNode,
  raw: string,
  cells: readonly TableCellSourceRange[],
  cellsBeforeSplitSeparators: ReadonlySet<number>,
): TableSourceReplacement[] {
  return [
    ...tableOpenerLayoutReplacements(table, raw),
    ...rowLayoutReplacements(table, raw),
    ...standaloneCellLayoutReplacements(
      cells,
      raw,
      cellsBeforeSplitSeparators,
    ),
  ];
}

function applyTableSourceReplacements(
  raw: string,
  replacements: readonly TableSourceReplacement[],
): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const replacement of [...replacements].sort(
    (a, b) => a.start - b.start,
  )) {
    if (
      replacement.start < cursor ||
      replacement.end < replacement.start ||
      replacement.end > raw.length
    ) {
      return raw;
    }
    parts.push(raw.slice(cursor, replacement.start), replacement.value);
    cursor = replacement.end;
  }
  parts.push(raw.slice(cursor));
  return parts.join("");
}

function lineDiagnosticsForReplacements(
  replacements: readonly TableSourceReplacement[],
): TableLineDiagnostic[] {
  const reasonsByLine = new Map<number, Set<string>>();
  for (const replacement of replacements) {
    const reasons =
      reasonsByLine.get(replacement.tableLine) ?? new Set<string>();
    reasons.add(replacement.reason);
    reasonsByLine.set(replacement.tableLine, reasons);
  }
  return [...reasonsByLine.entries()]
    .sort(([left], [right]) => left - right)
    .map(([tableLine, reasons]) => ({
      tableLine,
      changed: true,
      reason: [...reasons].join("; "),
    }));
}

function tableChangeReason(
  replacements: readonly TableSourceReplacement[],
): string {
  return [...new Set(replacements.map(({ reason }) => reason))].join("; ");
}

function analyzeParserTable(
  source: string,
  table: ParserTableNode,
  offset: number,
  options: ResolvedFormatOptions,
  confirmedStart?: number,
): ParserTableAnalysis {
  const start = confirmedStart ?? table.getAbsoluteIndex() + offset;
  const raw = table.toString();
  const cells = tableCellSourceRanges(table, raw);
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
    const layoutReplacements = tableLayoutReplacements(
      table,
      raw,
      cells,
      new Set(),
    );
    const value = applyTableSourceReplacements(raw, layoutReplacements);
    const changed = value !== raw;
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
        reason: changed
          ? tableChangeReason(layoutReplacements)
          : "inline cell separators explicitly preserved; no table layout normalization required",
        separatorStyle: style,
        separatorStyleReason,
        ...(changed && layoutReplacements.length > 0
          ? {
              lineDiagnostics:
                lineDiagnosticsForReplacements(layoutReplacements),
            }
          : {}),
      },
    };
  }

  const confirmed = confirmedInlineSeparators(table, raw, cells);
  if (!confirmed.balanced) {
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
        lineDiagnostics: confirmed.unbalancedLines.map((tableLine) => ({
          tableLine,
          changed: false,
          reason: "top-level table cell fallback did not balance this line",
        })),
      },
    };
  }
  const cellsBeforeSplitSeparators = new Set(
    cells
      .map(({ cellRange }) => cellRange)
      .filter((range) =>
        confirmed.separators.some(({ position }) => position === range.end),
      )
      .map(({ end }) => end),
  );
  const layoutReplacements = tableLayoutReplacements(
    table,
    raw,
    cells,
    cellsBeforeSplitSeparators,
  );
  const separatorReplacements = confirmed.separators.map(
    ({ position, marker }) => {
      const start = raw[position - 1] === " " ? position - 1 : position;
      return {
        start,
        end: position + 2,
        value: `\n${marker}`,
        tableLine: tableLineAt(raw, start),
        reason: "split inline table cell separator",
      };
    },
  );
  const replacements = [...layoutReplacements, ...separatorReplacements];
  const value = applyTableSourceReplacements(raw, replacements);
  const lineDiagnostics = lineDiagnosticsForReplacements(replacements);
  const changed = value !== raw;
  const fallbackReason = confirmed.parserBoundariesReliable
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
      reason: !changed
        ? "no table layout or inline parser-confirmed cell separator changes required"
        : [fallbackReason, tableChangeReason(replacements)]
            .filter((reason): reason is string => reason !== undefined)
            .join("; "),
      separatorStyle: style,
      separatorStyleReason,
      ...(changed && lineDiagnostics.length > 0 ? { lineDiagnostics } : {}),
    },
  };
}

export function profileParserTableAnalyses(
  context: ParsedDocumentContext,
  options: ResolvedFormatOptions,
  onProfile?: (profile: ParserTableAnalysisProfile) => void,
): ParserTableAnalysisProfile[] {
  const source = context.source;
  const candidates = collectParserTableCandidates(context);
  return candidates.map(({ node, offset, start }, index) => {
    const started = performance.now();
    const analysis = analyzeParserTable(
      source,
      node,
      offset,
      options,
      start,
    );
    const profile = {
      index,
      start,
      bytes: node.toString().length,
      milliseconds: performance.now() - started,
      changed: analysis.changed,
      eligible: analysis.eligible,
    };
    onProfile?.(profile);
    return profile;
  });
}

export function potentialParserTableOpenerPositions(source: string): number[] {
  return [...source.matchAll(/\{\|/gu)]
    .map((match) => match.index)
    .filter((opener) => source[opener - 1] !== "{");
}

export function collectParserTableCandidates(
  context: ParsedDocumentContext,
  stats?: ParserTableCandidateStats,
): ParserTableCandidate[] {
  const source = context.source;
  if (stats) {
    stats.openerCount = 0;
    stats.rootCandidates = 0;
    stats.fallbackParses = 0;
    stats.fallbackSourceBytes = 0;
    stats.coveredOpeners = 0;
  }
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
  if (stats) stats.rootCandidates = candidates.size;

  // Known parser-order defect: table nodes inside template parameter text are
  // not always exposed. Reparse only uncovered openers in the smallest parser
  // node that safely encloses them. A successful parse can confirm multiple or
  // nested tables, so later openers covered by those cached ranges do not
  // trigger another suffix parse.
  const enclosingRanges = [
    ...context.root.querySelectorAll<ParserTableNode>("template"),
    ...context.root.querySelectorAll<ParserTableNode>("magic-word"),
  ].map((node) => ({
    start: node.getAbsoluteIndex(),
    end: node.getAbsoluteIndex() + node.toString().length,
  }));
  const openers = potentialParserTableOpenerPositions(source);
  if (stats) stats.openerCount = openers.length;
  for (const opener of openers) {
    if (
      [...candidates.values()].some(
        (candidate) =>
          candidate.start <= opener && candidate.end > opener,
      )
    ) {
      if (stats) stats.coveredOpeners++;
      continue;
    }
    const enclosing = enclosingRanges
      .filter((range) => range.start <= opener && range.end > opener)
      .sort(
        (a, b) =>
          a.end - a.start - (b.end - b.start) || a.start - b.start,
      )[0];
    const parseEnd = enclosing?.end ?? source.length;
    const fallbackSource = source.slice(opener, parseEnd);
    if (stats) {
      stats.fallbackParses++;
      stats.fallbackSourceBytes += fallbackSource.length;
    }
    const reparsed = context.session.createContext(fallbackSource);
    for (const node of reparsed.root.querySelectorAll<ParserTableNode>("table")) {
      add(node, opener);
    }
  }
  return [...candidates.values()].sort((a, b) => a.start - b.start);
}

function deepestChangedTables(
  analyses: readonly ParserTableAnalysis[],
): Array<{ analysis: ParserTableAnalysis; index: number }> {
  const changed = analyses
    .map((analysis, index) => ({ analysis, index }))
    .filter(({ analysis }) => analysis.changed)
    .sort(
      (a, b) =>
        a.analysis.start - b.analysis.start ||
        b.analysis.end - a.analysis.end,
    );
  const stack: typeof changed = [];
  const withChangedDescendants = new Set<ParserTableAnalysis>();
  for (const candidate of changed) {
    while (stack.length > 0) {
      const possibleParent = stack.at(-1)!.analysis;
      if (
        possibleParent.start < candidate.analysis.start &&
        possibleParent.end > candidate.analysis.end
      ) {
        withChangedDescendants.add(possibleParent);
        break;
      }
      stack.pop();
    }
    stack.push(candidate);
  }
  return changed.filter(
    ({ analysis }) => !withChangedDescendants.has(analysis),
  );
}

function applyTableChanges(
  source: string,
  changes: ReadonlyArray<{ analysis: ParserTableAnalysis }>,
): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const { analysis } of [...changes].sort(
    (a, b) => a.analysis.start - b.analysis.start,
  )) {
    parts.push(source.slice(cursor, analysis.start), analysis.value);
    cursor = analysis.end;
  }
  parts.push(source.slice(cursor));
  return parts.join("");
}

function formatParserTables(
  context: ParsedDocumentContext,
  options: ResolvedFormatOptions,
): TableFormatWithDiagnosticsResult {
  const source = context.source;
  const maxPasses = 64;
  let output = source;
  let firstContext: ParsedDocumentContext | undefined = context;
  let diagnostics: TableDiagnostic[] = [];
  let diagnosticIds: string[] = [];
  const summary = emptySummary();
  const changedNodeIds = new Set<string>();

  const finalize = (formatted: string): TableFormatWithDiagnosticsResult => {
    summary.tablesChanged = changedNodeIds.size;
    summary.tablesAlreadyCanonical = Math.max(
      0,
      summary.tablesEligible - summary.tablesChanged,
    );
    summary.changedTableSemanticIds = [...changedNodeIds];
    diagnostics = diagnostics.map((diagnostic, index) => ({
      ...diagnostic,
      semanticId: diagnosticIds[index],
      changed: changedNodeIds.has(diagnosticIds[index]!),
    }));
    return { formatted, diagnostics, summary };
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    const current =
      firstContext ?? context.session.createContext(output);
    firstContext = undefined;
    const tables = collectParserTableCandidates(current);
    const semanticIds = semanticRangeIdentities(tables, "table");
    const analyses = tables.map(({ node, offset, start }) =>
      analyzeParserTable(output, node, offset, options, start),
    );
    if (pass === 0) {
      diagnosticIds = semanticIds;
      summary.tableSemanticIds = semanticIds;
      diagnostics = analyses.map(({ diagnostic }, index) => ({
        ...diagnostic,
        semanticId: semanticIds[index],
      }));
      summary.tablesInspected = analyses.length;
      summary.tablesSkippedAmbiguous = analyses.filter(
        ({ eligible }) => !eligible,
      ).length;
      summary.tablesEligible =
        summary.tablesInspected - summary.tablesSkippedAmbiguous;
    }
    const deepest = deepestChangedTables(analyses);
    if (deepest.length === 0) {
      summary.formattingPassesUsed = pass;
      return finalize(output);
    }
    output = applyTableChanges(output, deepest);
    for (const { index } of deepest) {
      changedNodeIds.add(semanticIds[index]!);
    }
    summary.formattingPassesUsed = pass + 1;
  }

  summary.convergenceLimitReached = true;
  changedNodeIds.clear();
  diagnostics = diagnostics.map((diagnostic) => ({
    ...diagnostic,
    changed: false,
    ambiguous: true,
    reason: "table formatting did not converge within 64 parser passes",
  }));
  summary.tablesEligible = 0;
  summary.tablesSkippedAmbiguous = summary.tablesInspected;
  return finalize(source);
}

export function formatTablesWithDiagnostics(
  context: ParsedDocumentContext,
  options: ResolvedFormatOptions,
): TableFormatWithDiagnosticsResult {
  return formatParserTables(context, options);
}

export function formatTables(
  context: ParsedDocumentContext,
  options: ResolvedFormatOptions,
): string {
  return formatTablesWithDiagnostics(context, options).formatted;
}

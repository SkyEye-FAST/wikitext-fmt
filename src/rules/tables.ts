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

function nearestTable(
  node: ParserTableNode | undefined,
): ParserTableNode | undefined {
  let current = node;
  while (current && current.type !== "table") current = current.parentNode;
  return current;
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

function lineNumbersAtPositions(
  source: string,
  positions: readonly number[],
): number[] {
  const lines: number[] = [];
  let line = 1;
  let cursor = 0;
  for (const position of positions) {
    while (cursor < position) {
      const newline = source.indexOf("\n", cursor);
      if (newline < 0 || newline >= position) {
        cursor = position;
        break;
      }
      line++;
      cursor = newline + 1;
    }
    lines.push(line);
  }
  return lines;
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
  table: ParserTableNode,
  raw: string,
): Array<{ position: number; marker: "!" | "|" }> {
  let cursor = 0;
  const separators: Array<{ position: number; marker: "!" | "|" }> = [];
  for (const cell of table
    .querySelectorAll<ParserTableNode>("td")
    .filter((cell) => nearestTable(cell.parentNode) === table)) {
    const cellRaw = cell.toString();
    const cellStart = raw.indexOf(cellRaw, cursor);
    if (cellStart < 0) continue;
    const syntaxRaw = cell.firstChild?.toString();
    if (syntaxRaw === "!!" || syntaxRaw === "||") {
      const syntaxStart = cellRaw.indexOf(syntaxRaw);
      if (syntaxStart >= 0) {
        separators.push({
          position: cellStart + syntaxStart,
          marker: cell.subtype === "th" ? "!" : "|",
        });
      }
    }
    cursor = cellStart + cellRaw.length;
  }
  return separators;
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
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

function standaloneCellLayoutReplacements(
  table: ParserTableNode,
): TableSourceReplacement[] {
  const tableStart = table.getAbsoluteIndex();
  const replacements: TableSourceReplacement[] = [];
  for (const cell of table
    .querySelectorAll<ParserTableNode>("td")
    .filter((candidate) => nearestTable(candidate.parentNode) === table)) {
    if (cell.subtype === "caption") continue;
    const syntax = cell.childNodes[0]?.toString() ?? "";
    if (!/\n[\t ]*[!|]$/u.test(syntax)) continue;
    const attributes = cell.childNodes[1]?.toString() ?? "";
    const contentNode = cell.childNodes[2];
    if (contentNode?.querySelectorAll<ParserTableNode>("table").length) {
      continue;
    }
    const content = contentNode?.toString() ?? "";
    const rendered =
      attributes.length > 0
        ? `${syntax}${renderCellAttributes(attributes)}|${renderCellContent(content)}`
        : `${syntax}${renderCellContent(content)}`;
    const raw = cell.toString();
    if (rendered === raw) continue;
    const start = cell.getAbsoluteIndex() - tableStart;
    replacements.push({ start, end: start + raw.length, value: rendered });
  }
  return replacements;
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

function analyzeParserTable(
  source: string,
  table: ParserTableNode,
  offset: number,
  options: ResolvedFormatOptions,
  confirmedStart?: number,
): ParserTableAnalysis {
  const start = confirmedStart ?? table.getAbsoluteIndex() + offset;
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

  const parserConfirmed = parserSeparators(table, raw);
  const parserPositions = parserConfirmed.map(({ position }) => position);
  const lexical = lexicalSeparatorPositions(
    raw,
    protectedTableRanges(table, raw),
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
        lineDiagnostics: lexical.unbalancedLines.map((tableLine) => ({
          tableLine,
          changed: false,
          reason: "top-level table cell fallback did not balance this line",
        })),
      },
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
  const positions = separators.map(({ position }) => position);
  const layoutReplacements = standaloneCellLayoutReplacements(table);
  const separatorReplacements = separators.map(({ position, marker }) => ({
    start: position,
    end: position + 2,
    value: `\n${marker}`,
  }));
  const value = applyTableSourceReplacements(raw, [
    ...layoutReplacements,
    ...separatorReplacements,
  ]);
  const lineDiagnostics: TableLineDiagnostic[] = [
    ...new Set(
      lineNumbersAtPositions(raw, [
        ...positions,
        ...layoutReplacements.map(({ start }) => start),
      ]),
    ),
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

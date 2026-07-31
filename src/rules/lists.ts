import type { Config } from "wikiparser-node";

import {
  collectNodes,
  createParserContext,
  lineRangeAt,
  nodeRange,
  type ParsedDocumentContext,
  type ParserNodeLike,
  type SourceRange,
} from "../parserContext.js";
import {
  collectIgnoreRanges,
  collectProtectedRanges,
} from "../utils/protectBlocks.js";

const LIST_LINE = /^([*#:;]+)([ \t]*)(\S.*)$/u;
const EMPTY_LIST_LINE = /^([*#:;]+)[ \t]*$/u;
const LIST_CANDIDATE = /^([*#:;]+)(.*)$/u;
const HAS_LIST_CANDIDATE = /^[*#:;]/mu;
const LIST_PREFIX = /^([*#:;]+)([ \t]*)$/u;
const STRUCTURED_CONTENT_SELECTOR =
  "template, magic-word, link, file, category, ext-link, ext, html, comment";

export type ListSkipReason =
  | "not-parser-confirmed"
  | "ambiguous-marker-boundary"
  | "unicode-separator"
  | "multiline-content"
  | "unclosed-comment"
  | "ignore-range"
  | "protected-block"
  | "structure-changed"
  | "candidate-not-roundtrip-safe";

export interface ListDiagnostics {
  listLinesInspected: number;
  listLinesEligible: number;
  listLinesChanged: number;
  listLinesAlreadyCanonical: number;
  listLinesSkippedAmbiguous: number;
  mixedMarkerLinesChanged: number;
  commentBearingLinesChanged: number;
  structuredContentLinesChanged: number;
  skipReasons: Partial<Record<ListSkipReason, number>>;
}

export interface ListFormatResult {
  formatted: string;
  diagnostics: ListDiagnostics;
}

export interface ListFormatOptions {
  /**
   * The full formatter can delegate candidate verification to its mandatory
   * final parse and document-equivalence gates. Direct callers verify locally.
   */
  verifyCandidate?: boolean;
}

interface ListParserNode extends ParserNodeLike {
  type: string;
  parentNode?: ListParserNode;
  indent?: number;
  dd?: boolean;
  dt?: boolean;
  ul?: boolean;
  ol?: boolean;
  getRange(): ListParserNode;
}

interface StructureFingerprint {
  type: string;
  start: number;
  raw: string;
}

interface ListLineDescriptor {
  markers: string;
  prefixEnd: number;
  body: string;
  rangeBody: string;
  flags: string;
  structures: StructureFingerprint[];
}

interface SourceEdit extends SourceRange {
  value: string;
}

interface PlannedLine {
  lineIndex: number;
  edits: SourceEdit[];
  before: ListLineDescriptor;
  mixedMarkers: boolean;
  commentBearing: boolean;
  structuredContent: boolean;
}

interface ListLineCandidate {
  lineIndex: number;
  lineStart: number;
  lineEnd: number;
  line: string;
  markers: string;
  body: string;
}

interface StructuralNode {
  type: string;
  raw: string;
  range: SourceRange;
}

function emptyListDiagnostics(): ListDiagnostics {
  return {
    listLinesInspected: 0,
    listLinesEligible: 0,
    listLinesChanged: 0,
    listLinesAlreadyCanonical: 0,
    listLinesSkippedAmbiguous: 0,
    mixedMarkerLinesChanged: 0,
    commentBearingLinesChanged: 0,
    structuredContentLinesChanged: 0,
    skipReasons: {},
  };
}

function recordSkip(
  diagnostics: ListDiagnostics,
  reason: ListSkipReason,
): void {
  diagnostics.listLinesSkippedAmbiguous++;
  diagnostics.skipReasons[reason] =
    (diagnostics.skipReasons[reason] ?? 0) + 1;
}

function intersects(a: SourceRange, b: SourceRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function sourceLineEnd(
  context: ParsedDocumentContext,
  lineIndex: number,
): number {
  const range = lineRangeAt(context, lineIndex);
  return context.source.charCodeAt(range.end - 1) === 13
    ? range.end - 1
    : range.end;
}

function collectListLineCandidates(source: string): ListLineCandidate[] {
  if (!HAS_LIST_CANDIDATE.test(source)) return [];
  const candidates: ListLineCandidate[] = [];
  let lineIndex = 0;
  let lineStart = 0;
  while (lineStart <= source.length) {
    const newline = source.indexOf("\n", lineStart);
    const rawLineEnd = newline < 0 ? source.length : newline;
    const lineEnd =
      source.charCodeAt(rawLineEnd - 1) === 13 ? rawLineEnd - 1 : rawLineEnd;
    const line = source.slice(lineStart, lineEnd);
    const candidate = LIST_CANDIDATE.exec(line);
    const markers = candidate?.[1];
    if (markers) {
      candidates.push({
        lineIndex,
        lineStart,
        lineEnd,
        line,
        markers,
        body: candidate[2] ?? "",
      });
    }
    if (newline < 0) break;
    lineStart = newline + 1;
    lineIndex++;
  }
  return candidates;
}

function collectStructuralNodes(
  context: ParsedDocumentContext,
): StructuralNode[] {
  const nodes: StructuralNode[] = [];
  for (const candidate of collectNodes(context, STRUCTURED_CONTENT_SELECTOR)) {
    const node = candidate as ListParserNode;
    try {
      nodes.push({
        type: node.type,
        raw: node.toString(),
        range: nodeRange(node),
      });
    } catch {
      // Detached parser artifacts are not safe source-range evidence.
    }
  }
  return nodes.sort(
    (a, b) =>
      a.range.start - b.range.start ||
      a.range.end - b.range.end ||
      a.type.localeCompare(b.type),
  );
}

function structuresByCandidateLine(
  candidates: readonly ListLineCandidate[],
  structures: readonly StructuralNode[],
): ReadonlyMap<number, readonly StructuralNode[]> {
  const byLine = new Map<number, StructuralNode[]>();
  let firstCandidate = 0;
  for (const structure of structures) {
    while (
      firstCandidate < candidates.length &&
      candidates[firstCandidate]!.lineEnd <= structure.range.start
    ) {
      firstCandidate++;
    }
    for (
      let index = firstCandidate;
      index < candidates.length &&
      candidates[index]!.lineStart < structure.range.end;
      index++
    ) {
      const candidate = candidates[index]!;
      if (
        intersects(
          { start: candidate.lineStart, end: candidate.lineEnd },
          structure.range,
        )
      ) {
        const lineStructures = byLine.get(candidate.lineIndex) ?? [];
        lineStructures.push(structure);
        byLine.set(candidate.lineIndex, lineStructures);
      }
    }
  }
  return byLine;
}

function lineStructures(
  structures: readonly StructuralNode[],
  contentStart: number,
  lineEnd: number,
): StructureFingerprint[] {
  return structures
    .filter(
      (structure) =>
        structure.range.start >= contentStart && structure.range.end <= lineEnd,
    )
    .map((structure) => ({
      type: structure.type,
      start: structure.range.start - contentStart,
      raw: structure.raw,
    }));
}

function listNodesAtLineStart(
  context: ParsedDocumentContext,
): Map<number, ListParserNode[]> {
  const byStart = new Map<number, ListParserNode[]>();
  for (const candidate of collectNodes(context, "list")) {
    const node = candidate as ListParserNode;
    let start: number;
    try {
      start = node.getAbsoluteIndex();
    } catch {
      continue;
    }
    const nodes = byStart.get(start) ?? [];
    nodes.push(node);
    byStart.set(start, nodes);
  }
  return byStart;
}

function describeParserListLine(
  context: ParsedDocumentContext,
  lineIndex: number,
  candidateMarkers: string,
  listNodes: ReadonlyMap<number, readonly ListParserNode[]>,
  structures: readonly StructuralNode[],
):
  | { descriptor: ListLineDescriptor }
  | { reason: ListSkipReason } {
  const lineStart = context.lineStarts[lineIndex];
  if (lineStart === undefined) return { reason: "not-parser-confirmed" };
  const lineEnd = sourceLineEnd(context, lineIndex);
  const nodes = listNodes.get(lineStart) ?? [];
  const node = nodes.find((item) => item.parentNode?.type === "root");
  if (!node) {
    return {
      reason: nodes.length > 0 ? "protected-block" : "not-parser-confirmed",
    };
  }

  let range: ListParserNode;
  let prefixEnd: number;
  try {
    range = node.getRange();
    prefixEnd = range.getAbsoluteIndex();
  } catch {
    return { reason: "ambiguous-marker-boundary" };
  }
  if (prefixEnd < lineStart || prefixEnd > lineEnd) {
    return { reason: "ambiguous-marker-boundary" };
  }

  const prefix = context.source.slice(lineStart, prefixEnd);
  const prefixMatch = LIST_PREFIX.exec(prefix);
  const markers = prefixMatch?.[1];
  if (!markers || markers !== candidateMarkers) {
    return { reason: "ambiguous-marker-boundary" };
  }

  return {
    descriptor: {
      markers,
      prefixEnd,
      body: context.source
        .slice(prefixEnd, lineEnd)
        .replace(/[ \t]+$/u, ""),
      rangeBody: range.toString().replace(/[ \t]+$/u, ""),
      flags: JSON.stringify({
        indent: node.indent,
        dd: node.dd,
        dt: node.dt,
        ul: node.ul,
        ol: node.ol,
      }),
      structures: lineStructures(structures, prefixEnd, lineEnd),
    },
  };
}

function applyEdits(source: string, edits: readonly SourceEdit[]): string {
  let output = source;
  let previousStart = source.length;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > previousStart
    ) {
      return source;
    }
    output =
      output.slice(0, edit.start) + edit.value + output.slice(edit.end);
    previousStart = edit.start;
  }
  return output;
}

function sameDescriptor(
  before: ListLineDescriptor,
  after: ListLineDescriptor,
): boolean {
  return (
    before.markers === after.markers &&
    before.body === after.body &&
    before.rangeBody === after.rangeBody &&
    before.flags === after.flags &&
    JSON.stringify(before.structures) === JSON.stringify(after.structures)
  );
}

function isMixedMarkerSequence(markers: string): boolean {
  return new Set(markers).size > 1;
}

function extensionRanges(context: ParsedDocumentContext): SourceRange[] {
  const ranges: SourceRange[] = [];
  for (const node of collectNodes(context, "ext")) {
    try {
      ranges.push(nodeRange(node));
    } catch {
      // A detached extension node cannot safely establish a protected range.
    }
  }
  return ranges;
}

/**
 * Format parser-confirmed list prefixes without touching list item content.
 */
export function formatListsWithDiagnostics(
  source: string,
  config: Config,
  context?: ParsedDocumentContext,
  options: ListFormatOptions = {},
): ListFormatResult {
  const diagnostics = emptyListDiagnostics();
  const candidates = collectListLineCandidates(source);
  if (candidates.length === 0) {
    return { formatted: source, diagnostics };
  }

  const resolvedContext = context ?? createParserContext(source, config);
  if (
    resolvedContext.source !== source ||
    resolvedContext.root.toString() !== source
  ) {
    return { formatted: source, diagnostics };
  }

  diagnostics.listLinesInspected = candidates.length;
  const listNodes = listNodesAtLineStart(resolvedContext);
  const hasParserConfirmedCandidate = candidates.some((candidate) =>
    (listNodes.get(candidate.lineStart) ?? []).some(
      (node) => node.parentNode?.type === "root",
    ),
  );
  if (!hasParserConfirmedCandidate) {
    for (const candidate of candidates) {
      const described = describeParserListLine(
        resolvedContext,
        candidate.lineIndex,
        candidate.markers,
        listNodes,
        [],
      );
      recordSkip(
        diagnostics,
        "reason" in described ? described.reason : "not-parser-confirmed",
      );
    }
    return { formatted: source, diagnostics };
  }

  const ignoreRanges = collectIgnoreRanges(source);
  const protectedRanges = collectProtectedRanges(source, {
    protectComments: false,
    protectTables: true,
    additionalRanges: extensionRanges(resolvedContext),
  }).filter(
    (range) =>
      !ignoreRanges.some(
        (ignore) => ignore.start === range.start && ignore.end === range.end,
      ),
  );
  const structures = collectStructuralNodes(resolvedContext);
  const structuresByLine = structuresByCandidateLine(candidates, structures);
  const planned: PlannedLine[] = [];

  for (const candidate of candidates) {
    const {
      lineIndex,
      lineStart,
      lineEnd,
      line,
      markers: candidateMarkers,
      body: candidateBody,
    } = candidate;
    if (
      candidateBody.includes("\uE000wikitext-fmt:") ||
      /^[ \t]*\{\|/u.test(candidateBody)
    ) {
      recordSkip(diagnostics, "protected-block");
      continue;
    }
    if (
      candidateMarkers === "#" &&
      /^#[^#*:;\s\[]+[ \t]*\[\[/u.test(line)
    ) {
      recordSkip(diagnostics, "ambiguous-marker-boundary");
      continue;
    }

    const lineRange = { start: lineStart, end: lineEnd };
    if (ignoreRanges.some((range) => intersects(lineRange, range))) {
      recordSkip(diagnostics, "ignore-range");
      continue;
    }
    if (
      protectedRanges.some(
        (range) => range.start <= lineStart && range.end > lineStart,
      )
    ) {
      recordSkip(diagnostics, "protected-block");
      continue;
    }

    const nextCharacter = [...line.slice(candidateMarkers.length)][0];
    if (nextCharacter && /[^\S \t]/u.test(nextCharacter)) {
      recordSkip(diagnostics, "unicode-separator");
      continue;
    }

    const described = describeParserListLine(
      resolvedContext,
      lineIndex,
      candidateMarkers,
      listNodes,
      structuresByLine.get(lineIndex) ?? [],
    );
    if ("reason" in described) {
      recordSkip(diagnostics, described.reason);
      continue;
    }

    const overlappingStructures = structuresByLine.get(lineIndex) ?? [];
    const comments = overlappingStructures.filter(
      (structure) => structure.type === "comment",
    );
    if (comments.some((comment) => !comment.raw.endsWith("-->"))) {
      recordSkip(diagnostics, "unclosed-comment");
      continue;
    }
    if (
      described.descriptor.rangeBody.includes("\n") ||
      described.descriptor.rangeBody.includes("\r") ||
      overlappingStructures.some(
        (structure) =>
          structure.raw.includes("\n") || structure.raw.includes("\r"),
      )
    ) {
      recordSkip(diagnostics, "multiline-content");
      continue;
    }

    const body = source.slice(described.descriptor.prefixEnd, lineEnd);
    const desiredPrefix = `${candidateMarkers}${body.length === 0 ? "" : " "}`;
    const edits: SourceEdit[] = [];
    if (
      source.slice(lineStart, described.descriptor.prefixEnd) !== desiredPrefix
    ) {
      edits.push({
        start: lineStart,
        end: described.descriptor.prefixEnd,
        value: desiredPrefix,
      });
    }
    const trailingStart =
      body.length === 0
        ? lineEnd
        : lineEnd - (/[ \t]+$/u.exec(body)?.[0].length ?? 0);
    if (trailingStart < lineEnd) {
      edits.push({ start: trailingStart, end: lineEnd, value: "" });
    }
    if (
      edits.some((edit) =>
        protectedRanges.some((range) => intersects(edit, range)),
      )
    ) {
      recordSkip(diagnostics, "protected-block");
      continue;
    }

    diagnostics.listLinesEligible++;
    if (edits.length === 0) {
      diagnostics.listLinesAlreadyCanonical++;
      continue;
    }
    planned.push({
      lineIndex,
      edits,
      before: described.descriptor,
      mixedMarkers: isMixedMarkerSequence(candidateMarkers),
      commentBearing: comments.length > 0,
      structuredContent: overlappingStructures.some(
        (structure) => structure.type !== "comment",
      ),
    });
  }

  if (planned.length === 0) return { formatted: source, diagnostics };
  const candidate = applyEdits(
    source,
    planned.flatMap((line) => line.edits),
  );
  if (options.verifyCandidate === false) {
    diagnostics.listLinesChanged = planned.length;
    diagnostics.mixedMarkerLinesChanged = planned.filter(
      (line) => line.mixedMarkers,
    ).length;
    diagnostics.commentBearingLinesChanged = planned.filter(
      (line) => line.commentBearing,
    ).length;
    diagnostics.structuredContentLinesChanged = planned.filter(
      (line) => line.structuredContent,
    ).length;
    return { formatted: candidate, diagnostics };
  }

  let candidateContext: ParsedDocumentContext;
  try {
    candidateContext = createParserContext(candidate, config);
  } catch {
    for (const _line of planned) {
      recordSkip(diagnostics, "candidate-not-roundtrip-safe");
    }
    return { formatted: source, diagnostics };
  }
  if (candidateContext.root.toString() !== candidate) {
    for (const _line of planned) {
      recordSkip(diagnostics, "candidate-not-roundtrip-safe");
    }
    return { formatted: source, diagnostics };
  }

  const candidateListNodes = listNodesAtLineStart(candidateContext);
  const candidateStructures = collectStructuralNodes(candidateContext);
  const candidateLines = collectListLineCandidates(candidate);
  const candidateStructuresByLine = structuresByCandidateLine(
    candidateLines,
    candidateStructures,
  );
  for (const line of planned) {
    const described = describeParserListLine(
      candidateContext,
      line.lineIndex,
      line.before.markers,
      candidateListNodes,
      candidateStructuresByLine.get(line.lineIndex) ?? [],
    );
    if (
      "reason" in described ||
      !sameDescriptor(line.before, described.descriptor)
    ) {
      for (const _plannedLine of planned) {
        recordSkip(diagnostics, "structure-changed");
      }
      return { formatted: source, diagnostics };
    }
  }

  diagnostics.listLinesChanged = planned.length;
  diagnostics.mixedMarkerLinesChanged = planned.filter(
    (line) => line.mixedMarkers,
  ).length;
  diagnostics.commentBearingLinesChanged = planned.filter(
    (line) => line.commentBearing,
  ).length;
  diagnostics.structuredContentLinesChanged = planned.filter(
    (line) => line.structuredContent,
  ).length;
  return { formatted: candidate, diagnostics };
}

export function formatLists(
  source: string,
  config: Config,
  context?: ParsedDocumentContext,
  options?: ListFormatOptions,
): string {
  return formatListsWithDiagnostics(source, config, context, options).formatted;
}

/**
 * Canonicalize only the exact ASCII list layout admitted by document
 * equivalence. This helper does not establish parser eligibility for output.
 */
export function canonicalizeListLayout(source: string): string {
  return source
    .split("\n")
    .map((rawLine) => {
      const carriageReturn = rawLine.endsWith("\r") ? "\r" : "";
      const line = carriageReturn ? rawLine.slice(0, -1) : rawLine;
      const empty = EMPTY_LIST_LINE.exec(line);
      if (empty?.[1]) return empty[1] + carriageReturn;
      const match = LIST_LINE.exec(line);
      if (!match) return rawLine;
      const [, markers, , content] = match;
      if (!markers || !content) return rawLine;
      return `${markers} ${content.replace(/[ \t]+$/u, "")}${carriageReturn}`;
    })
    .join("\n");
}

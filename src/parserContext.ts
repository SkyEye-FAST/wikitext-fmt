import type { ParserRoot, ParserSession } from "./parserRuntime.js";

export interface SourceRange {
  start: number;
  end: number;
}

export interface ParsedDocumentContext {
  /**
   * Parser contexts are valid only for this exact source snapshot. Any rule
   * that changes text must discard older contexts and parse the new source.
   */
  readonly source: string;
  readonly root: ParserRoot;
  readonly session: ParserSession;
  readonly lineStarts: readonly number[];
}

export interface ParserNodeLike {
  getAbsoluteIndex(): number;
  toString(): string;
}

export interface ParserTreeNodeLike extends ParserNodeLike {
  readonly childNodes: readonly ParserTreeNodeLike[];
  readonly parentNode?: ParserTreeNodeLike;
}

export interface ParserContextMetrics {
  contextsCreated: number;
  sourceBytesParsed: number;
}

const activeMetrics: ParserContextMetrics[] = [];

export function measureParserContexts<T>(operation: () => T): {
  result: T;
  metrics: ParserContextMetrics;
} {
  const metrics = { contextsCreated: 0, sourceBytesParsed: 0 };
  activeMetrics.push(metrics);
  try {
    return { result: operation(), metrics };
  } finally {
    activeMetrics.pop();
  }
}

export function getLineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

export function createParserContext(
  source: string,
  session: ParserSession,
): ParsedDocumentContext {
  const metrics = activeMetrics.at(-1);
  if (metrics) {
    metrics.contextsCreated++;
    metrics.sourceBytesParsed += source.length;
  }
  return {
    source,
    root: session.parse(source),
    session,
    lineStarts: getLineStarts(source),
  };
}

export function nodeRange(node: ParserNodeLike): SourceRange {
  const start = node.getAbsoluteIndex();
  return { start, end: start + node.toString().length };
}

export function collectNodes(
  context: ParsedDocumentContext,
  selector: string,
): ParserNodeLike[] {
  return [...context.root.querySelectorAll(selector)] as ParserNodeLike[];
}

export function collectNodeRanges(
  context: ParsedDocumentContext,
  selector: string,
): SourceRange[];
export function collectNodeRanges(
  root: ParserRoot,
  selector: string,
): SourceRange[];
export function collectNodeRanges(
  input: ParsedDocumentContext | ParserRoot,
  selector: string,
): SourceRange[] {
  const root = "root" in input ? input.root : input;
  return root
    .querySelectorAll(selector)
    .map((node) => nodeRange(node as ParserNodeLike));
}

export function collectNodeRangesForContext(
  context: ParsedDocumentContext,
  selector: string,
): SourceRange[] {
  return collectNodeRanges(context, selector);
}

/**
 * Resolve requested node ranges while scanning each relevant parent once.
 * This avoids getAbsoluteIndex() becoming quadratic on documents with many
 * sibling nodes.
 */
export function collectNodeSourceRanges<T extends ParserTreeNodeLike>(
  context: ParsedDocumentContext,
  requestedNodes: readonly T[],
): ReadonlyMap<T, SourceRange> {
  const requested = new Set<ParserTreeNodeLike>(requestedNodes);
  const relevant = new Set<ParserTreeNodeLike>();
  for (const node of requestedNodes) {
    let current: ParserTreeNodeLike | undefined = node;
    while (current) {
      relevant.add(current);
      current = current.parentNode;
    }
  }

  const ranges = new Map<T, SourceRange>();
  const visit = (
    parent: ParserTreeNodeLike,
    parentStart: number,
    parentRaw: string,
  ): void => {
    let cursor = 0;
    for (const child of parent.childNodes) {
      const raw = child.toString();
      const relativeStart = parentRaw.indexOf(raw, cursor);
      if (relativeStart < 0) continue;
      const start = parentStart + relativeStart;
      const end = start + raw.length;
      if (requested.has(child)) ranges.set(child as T, { start, end });
      if (relevant.has(child)) visit(child, start, raw);
      cursor = relativeStart + raw.length;
    }
  };

  const root = context.root as unknown as ParserTreeNodeLike;
  if (root.toString() === context.source) visit(root, 0, context.source);
  return ranges;
}

export function isRangeInside(
  start: number,
  end: number,
  ranges: readonly SourceRange[],
): boolean {
  return ranges.some(
    (range) =>
      range.start <= start &&
      range.end >= end &&
      (range.start < start || range.end > end),
  );
}

export function rangeForWholeLine(
  source: string,
  start: number,
  end: number,
): SourceRange {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = source.indexOf("\n", end);
  return {
    start: lineStart,
    end: nextNewline < 0 ? source.length : nextNewline,
  };
}

export function isWholeLineRange(
  source: string,
  start: number,
  end: number,
): boolean {
  const line = rangeForWholeLine(source, start, end);
  return (
    source.slice(line.start, start).trim() === "" &&
    source.slice(end, line.end).trim() === ""
  );
}

export function isNodeWholeLine(
  context: ParsedDocumentContext,
  node: ParserNodeLike,
): boolean {
  const range = nodeRange(node);
  return isWholeLineRange(context.source, range.start, range.end);
}

export function lineIndexAt(
  context: ParsedDocumentContext,
  index: number,
): number {
  let low = 0;
  let high = context.lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = context.lineStarts[middle]!;
    const next = context.lineStarts[middle + 1] ?? context.source.length + 1;
    if (index < start) {
      high = middle - 1;
    } else if (index >= next) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return Math.max(0, Math.min(context.lineStarts.length - 1, low));
}

export function lineRangeAt(
  context: ParsedDocumentContext,
  lineIndex: number,
): SourceRange {
  const start = context.lineStarts[lineIndex];
  if (start === undefined) {
    throw new RangeError(`Line index out of range: ${lineIndex}`);
  }
  const nextStart = context.lineStarts[lineIndex + 1];
  const end =
    nextStart === undefined
      ? context.source.length
      : Math.max(start, nextStart - 1);
  return { start, end };
}

export function lineTextAt(
  context: ParsedDocumentContext,
  lineIndex: number,
): string {
  const range = lineRangeAt(context, lineIndex);
  return context.source.slice(range.start, range.end);
}

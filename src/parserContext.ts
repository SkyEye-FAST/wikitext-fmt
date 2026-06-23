import type { Config } from "wikiparser-node";
import { parseWikitext } from "./parser.js";

export interface SourceRange {
  start: number;
  end: number;
}

export interface ParsedDocumentContext {
  /**
   * Parser contexts are valid only for this exact source snapshot. Any rule
   * that changes text must discard older contexts and parse the new source.
   */
  source: string;
  root: ReturnType<typeof parseWikitext>;
  lineStarts: number[];
}

type ParserRoot = ParsedDocumentContext["root"];

export interface ParserNodeLike {
  getAbsoluteIndex(): number;
  toString(): string;
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
  config: Config,
): ParsedDocumentContext {
  return {
    source,
    root: parseWikitext(source, config),
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

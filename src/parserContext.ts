import type { Config } from "wikiparser-node";
import { parseWikitext } from "./parser.js";

export interface SourceRange {
  start: number;
  end: number;
}

export interface ParsedDocumentContext {
  source: string;
  root: ReturnType<typeof parseWikitext>;
  lineStarts: number[];
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

export function collectNodeRanges(
  root: ParsedDocumentContext["root"],
  selector: string,
): SourceRange[] {
  return root.querySelectorAll(selector).map((node) => {
    const start = node.getAbsoluteIndex();
    return { start, end: start + node.toString().length };
  });
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

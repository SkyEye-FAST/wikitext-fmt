export type LineEndingStyle =
  | "none"
  | "lf"
  | "crlf"
  | "mixed"
  | "bare-cr";

export interface SupportedNormalizedSource {
  supported: true;
  original: string;
  normalized: string;
  lineEnding: "none" | "lf" | "crlf";
  restore(value: string): string;
  originalOffset(normalizedOffset: number): number;
}

export interface UnsupportedNormalizedSource {
  supported: false;
  original: string;
  lineEnding: "mixed" | "bare-cr";
}

export type NormalizedSource =
  | SupportedNormalizedSource
  | UnsupportedNormalizedSource;

export function detectLineEndingStyle(source: string): LineEndingStyle {
  let hasLf = false;
  let hasCrlf = false;
  let hasBareCr = false;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    if (code === 13) {
      if (source.charCodeAt(index + 1) === 10) {
        hasCrlf = true;
        index++;
      } else {
        hasBareCr = true;
      }
    } else if (code === 10) {
      hasLf = true;
    }
  }
  if (hasBareCr) return "bare-cr";
  if (hasLf && hasCrlf) return "mixed";
  if (hasCrlf) return "crlf";
  if (hasLf) return "lf";
  return "none";
}

function countBefore(sortedOffsets: readonly number[], offset: number): number {
  let low = 0;
  let high = sortedOffsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedOffsets[middle]! < offset) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function normalizeSourceLineEndings(source: string): NormalizedSource {
  const lineEnding = detectLineEndingStyle(source);
  if (lineEnding === "mixed" || lineEnding === "bare-cr") {
    return { supported: false, original: source, lineEnding };
  }
  if (lineEnding !== "crlf") {
    return {
      supported: true,
      original: source,
      normalized: source,
      lineEnding,
      restore: (value) => value,
      originalOffset: (offset) => offset,
    };
  }

  const normalized = source.replaceAll("\r\n", "\n");
  const newlineOffsets: number[] = [];
  for (let index = 0; index < normalized.length; index++) {
    if (normalized.charCodeAt(index) === 10) newlineOffsets.push(index);
  }
  return {
    supported: true,
    original: source,
    normalized,
    lineEnding,
    restore: (value) => value.replaceAll("\n", "\r\n"),
    originalOffset: (offset) => offset + countBefore(newlineOffsets, offset),
  };
}

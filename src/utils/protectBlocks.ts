const PLACEHOLDER_PREFIX = "\uE000wikitext-fmt:";
const PLACEHOLDER_SUFFIX = ":\uE001";
const PROTECTED_TAGS = [
  "nowiki",
  "pre",
  "syntaxhighlight",
  "source",
  "templatedata",
  "math",
  "chem",
  "ref",
  "gallery",
];

export interface ProtectedText {
  text: string;
  restore(value: string): string;
  originalIndex(index: number): number;
}

export interface ProtectBlocksOptions {
  protectTables?: boolean;
  protectComments?: boolean;
  protectReferenceTags?: boolean;
}

interface Range {
  start: number;
  end: number;
}

function ignoreRanges(source: string): Range[] {
  const ranges: Range[] = [];
  const rangePattern =
    /<!--\s*wikitext-fmt-ignore-start\s*-->[\s\S]*?(?:<!--\s*wikitext-fmt-ignore-end\s*-->|$)/giu;
  for (const match of source.matchAll(rangePattern)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  const singlePattern = /<!--\s*wikitext-fmt-ignore\s*-->/giu;
  for (const match of source.matchAll(singlePattern)) {
    const start = match.index;
    const afterMarker = start + match[0].length;
    const rest = source.slice(afterMarker);
    const leading = /^(?:[ \t]*(?:\r?\n|$))*/u.exec(rest)?.[0].length ?? 0;
    const blockStart = afterMarker + leading;
    if (blockStart >= source.length) {
      ranges.push({ start, end: afterMarker });
      continue;
    }

    const block = source.slice(blockStart);
    const firstLine = /^(?:.*(?:\r?\n|$))/u.exec(block)?.[0] ?? block;
    let blockLength = firstLine.length;
    if (!/^\s*(?:={2,6}|\[\[[^\]\n]+:)/u.test(firstLine)) {
      const paragraph = /^(?:[\s\S]*?)(?=\r?\n[ \t]*\r?\n|$)/u.exec(block)?.[0];
      blockLength = paragraph?.length ?? block.length;
    }
    ranges.push({ start, end: blockStart + blockLength });
  }
  return ranges;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Range[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function structuralRanges(
  source: string,
  protectTables: boolean,
  protectComments: boolean,
  protectReferenceTags: boolean,
): Range[] {
  const ranges: Range[] = [];
  const tags = PROTECTED_TAGS.filter(
    (tag) => protectReferenceTags || tag !== "ref",
  ).join("|");
  const tagPattern = new RegExp(
    `<(${tags})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
    "giu",
  );
  for (const match of source.matchAll(tagPattern)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

  const unclosedTagPattern = new RegExp(
    `<(${tags})\\b(?![^>]*\\/\\s*>)[^>]*>(?![\\s\\S]*?<\\/\\1\\s*>)[\\s\\S]*$`,
    "giu",
  );
  for (const match of source.matchAll(unclosedTagPattern)) {
    ranges.push({ start: match.index, end: source.length });
  }

  if (protectComments) {
    for (const match of source.matchAll(/<!--[\s\S]*?(?:-->|$)/gu)) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  if (protectTables) {
    let tableStart: number | undefined;
    let tableDepth = 0;
    for (const match of source.matchAll(/^.*(?:\n|$)/gmu)) {
      const line = match[0];
      if (/^[ \t|!]*\{\|/u.test(line)) {
        if (tableDepth === 0) tableStart = match.index;
        tableDepth++;
      }
      if (tableDepth > 0 && /^[ \t]*\|\}/u.test(line)) {
        tableDepth--;
        if (tableDepth === 0 && tableStart !== undefined) {
          const newlineLength = line.match(/\r?\n$/u)?.[0].length ?? 0;
          ranges.push({
            start: tableStart,
            end: match.index + line.length - newlineLength,
          });
          tableStart = undefined;
        }
      }
    }
    if (tableStart !== undefined)
      ranges.push({ start: tableStart, end: source.length });
  }
  return ranges;
}

export function protectBlocks(
  source: string,
  options: ProtectBlocksOptions = {},
): ProtectedText {
  const ranges = mergeRanges([
    ...ignoreRanges(source),
    ...structuralRanges(
      source,
      options.protectTables ?? true,
      options.protectComments ?? true,
      options.protectReferenceTags ?? true,
    ),
  ]);
  const values: string[] = [];
  const mappings: Array<{
    protectedStart: number;
    protectedEnd: number;
    originalStart: number;
    originalEnd: number;
  }> = [];
  let cursor = 0;
  let text = "";

  for (const range of ranges) {
    text += source.slice(cursor, range.start);
    const index = values.push(source.slice(range.start, range.end)) - 1;
    const placeholder = `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
    const protectedStart = text.length;
    text += placeholder;
    mappings.push({
      protectedStart,
      protectedEnd: protectedStart + placeholder.length,
      originalStart: range.start,
      originalEnd: range.end,
    });
    cursor = range.end;
  }
  text += source.slice(cursor);

  return {
    text,
    restore(value: string): string {
      const pattern = new RegExp(
        `${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`,
        "gu",
      );
      return value.replace(
        pattern,
        (_, index: string) => values[Number(index)] ?? _,
      );
    },
    originalIndex(index: number): number {
      let delta = 0;
      for (const mapping of mappings) {
        if (index < mapping.protectedStart) break;
        if (index < mapping.protectedEnd) return mapping.originalStart;
        delta +=
          mapping.originalEnd -
          mapping.originalStart -
          (mapping.protectedEnd - mapping.protectedStart);
      }
      return index + delta;
    },
  };
}

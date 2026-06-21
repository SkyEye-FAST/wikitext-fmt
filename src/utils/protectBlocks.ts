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
}

interface Range {
  start: number;
  end: number;
}

function ignoreRanges(source: string): Range[] {
  const ranges: Range[] = [];
  const rangePattern = /<!--\s*wikitext-fmt-ignore-start\s*-->[\s\S]*?(?:<!--\s*wikitext-fmt-ignore-end\s*-->|$)/giu;
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
    if (!/^\s*(?:={2,6}|\[\[Category:)/iu.test(firstLine)) {
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

function structuralRanges(source: string): Range[] {
  const ranges: Range[] = [];
  const tags = PROTECTED_TAGS.join("|");
  const tagPattern = new RegExp(`<(${tags})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "giu");
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

  for (const match of source.matchAll(/<!--[\s\S]*?(?:-->|$)/gu)) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }

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
        ranges.push({ start: tableStart, end: match.index + line.length - newlineLength });
        tableStart = undefined;
      }
    }
  }
  if (tableStart !== undefined) ranges.push({ start: tableStart, end: source.length });
  return ranges;
}

export function protectBlocks(source: string): ProtectedText {
  const ranges = mergeRanges([...ignoreRanges(source), ...structuralRanges(source)]);
  const values: string[] = [];
  let cursor = 0;
  let text = "";

  for (const range of ranges) {
    text += source.slice(cursor, range.start);
    const index = values.push(source.slice(range.start, range.end)) - 1;
    text += `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
    cursor = range.end;
  }
  text += source.slice(cursor);

  return {
    text,
    restore(value: string): string {
      const pattern = new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, "gu");
      return value.replace(pattern, (_, index: string) => values[Number(index)] ?? _);
    },
  };
}

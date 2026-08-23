import {
  collectNodeSourceRanges,
  collectNodes,
  type ParsedDocumentContext,
  type ParserTreeNodeLike,
} from "../parserContext.js";

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
  protectIgnoreRanges?: boolean;
  parserContext?: ParsedDocumentContext;
  additionalRanges?: readonly Range[];
}

export interface Range {
  start: number;
  end: number;
}

type IgnoreMarkerKind = "single" | "start" | "end";

interface IgnoreParserNode extends ParserTreeNodeLike {
  readonly type: string;
  readonly parentNode?: IgnoreParserNode;
  readonly childNodes: readonly IgnoreParserNode[];
}

interface IgnoreMarker extends Range {
  kind: IgnoreMarkerKind;
  node?: IgnoreParserNode;
}

interface IgnoreTarget extends Range {
  node: IgnoreParserNode;
}

const IGNORE_MARKER =
  /^<!--\s*wikitext-fmt-ignore(?:-(start|end))?\s*-->$/iu;
const IGNORE_MARKER_GLOBAL =
  /<!--\s*wikitext-fmt-ignore(?:-(?:start|end))?\s*-->/giu;
const IGNORE_TARGET_TYPES = new Set([
  "category",
  "double-underscore",
  "ext",
  "ext-link",
  "file",
  "heading",
  "html",
  "link",
  "magic-word",
  "redirect",
  "redirect-target",
  "switch",
  "table",
  "template",
]);

function ignoreMarkerKind(raw: string): IgnoreMarkerKind | undefined {
  const match = IGNORE_MARKER.exec(raw);
  if (!match) return undefined;
  return match[1] === "start" || match[1] === "end" ? match[1] : "single";
}

function lexicalIgnoreMarkers(source: string): IgnoreMarker[] {
  return [...source.matchAll(IGNORE_MARKER_GLOBAL)].flatMap((match) => {
    const kind = ignoreMarkerKind(match[0]);
    return kind
      ? [{ start: match.index, end: match.index + match[0].length, kind }]
      : [];
  });
}

function parserIgnoreMarkersAndTargets(
  source: string,
  context: ParsedDocumentContext,
): { markers: IgnoreMarker[]; targets: IgnoreTarget[] } {
  if (context.source !== source || context.root.toString() !== source) {
    return { markers: lexicalIgnoreMarkers(source), targets: [] };
  }

  const nodes = collectNodes(context, "*") as IgnoreParserNode[];
  const markerNodes = nodes.filter(
    (node) => node.type === "comment" && ignoreMarkerKind(node.toString()),
  );
  const targetNodes = nodes.filter((node) => IGNORE_TARGET_TYPES.has(node.type));
  const nodeRanges = collectNodeSourceRanges(context, [
    ...markerNodes,
    ...targetNodes,
  ]);
  const markers = markerNodes.flatMap((node): IgnoreMarker[] => {
    const range = nodeRanges.get(node);
    const kind = ignoreMarkerKind(node.toString());
    return range && kind ? [{ ...range, kind, node }] : [];
  });
  const targets = targetNodes.flatMap((node): IgnoreTarget[] => {
    const range = nodeRanges.get(node);
    return range && range.end > range.start ? [{ ...range, node }] : [];
  });
  return { markers, targets };
}

function fallbackSingleIgnoreRange(source: string, marker: IgnoreMarker): Range {
  const rest = source.slice(marker.end);
  const leading = /^(?:[ \t]*(?:\r?\n|$))*/u.exec(rest)?.[0].length ?? 0;
  const blockStart = marker.end + leading;
  if (blockStart >= source.length) return { start: marker.start, end: marker.end };

  const block = source.slice(blockStart);
  const firstLine = /^(?:.*(?:\r?\n|$))/u.exec(block)?.[0] ?? block;
  let blockLength = firstLine.length;
  if (!/^\s*(?:={2,6}|\[\[[^\]\n]+:|[*#:;]+)/u.test(firstLine)) {
    const paragraph = /^(?:[\s\S]*?)(?=\r?\n[ \t]*\r?\n|$)/u.exec(block)?.[0];
    blockLength = paragraph?.length ?? block.length;
  }
  return { start: marker.start, end: blockStart + blockLength };
}

function singleIgnoreRange(
  source: string,
  marker: IgnoreMarker,
  targets: readonly IgnoreTarget[],
): Range {
  if (marker.node) {
    const target = targets.find(
      (candidate) =>
        candidate.start >= marker.end &&
        candidate.node.parentNode === marker.node?.parentNode &&
        /^\s*$/u.test(source.slice(marker.end, candidate.start)),
    );
    if (target) {
      const targetHasLineEnding = /\r?\n$/u.test(
        source.slice(target.start, target.end),
      );
      const trailingLineEnding = targetHasLineEnding
        ? ""
        : (/^[ \t]*(?:\r?\n|$)/u.exec(source.slice(target.end))?.[0] ?? "");
      return {
        start: marker.start,
        end: target.end + trailingLineEnding.length,
      };
    }
  }
  return fallbackSingleIgnoreRange(source, marker);
}

export function collectIgnoreRanges(
  source: string,
  context?: ParsedDocumentContext,
): Range[] {
  const { markers, targets } = context
    ? parserIgnoreMarkersAndTargets(source, context)
    : { markers: lexicalIgnoreMarkers(source), targets: [] };
  const orderedTargets = [...targets].sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const ranges: Range[] = [];
  let rangeDepth = 0;
  let rangeStart: number | undefined;

  for (const marker of markers.sort((left, right) => left.start - right.start)) {
    if (marker.kind === "start") {
      if (rangeDepth === 0) rangeStart = marker.start;
      rangeDepth++;
      continue;
    }
    if (marker.kind === "end") {
      if (rangeDepth === 0) continue;
      rangeDepth--;
      if (rangeDepth === 0 && rangeStart !== undefined) {
        ranges.push({ start: rangeStart, end: marker.end });
        rangeStart = undefined;
      }
      continue;
    }
    if (rangeDepth === 0) {
      ranges.push(singleIgnoreRange(source, marker, orderedTargets));
    }
  }
  if (rangeDepth > 0 && rangeStart !== undefined) {
    ranges.push({ start: rangeStart, end: source.length });
  }
  return mergeRanges(ranges);
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
    `<(${tags})\\b(?![^>]*\\/\\s*>)[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
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
  const ranges = collectProtectedRanges(source, options);
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
    const raw = source.slice(range.start, range.end);
    const trailingLineEnding = raw.match(/\r?\n$/u)?.[0] ?? "";
    const restoredValue = trailingLineEnding
      ? raw.slice(0, -trailingLineEnding.length)
      : raw;
    const index = values.push(restoredValue) - 1;
    const placeholder = `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}${trailingLineEnding}`;
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

export function collectProtectedRanges(
  source: string,
  options: ProtectBlocksOptions = {},
): Range[] {
  return mergeRanges([
    ...(options.protectIgnoreRanges ?? true
      ? collectIgnoreRanges(source, options.parserContext)
      : []),
    ...structuralRanges(
      source,
      options.protectTables ?? true,
      options.protectComments ?? true,
      options.protectReferenceTags ?? true,
    ),
    ...(options.additionalRanges ?? []),
  ]);
}

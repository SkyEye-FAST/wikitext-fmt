import type { Config } from "wikiparser-node";
import type { ResolvedFormatOptions } from "../options.js";
import { parseWikitext } from "../parser.js";
import { hasFinalNewline, withFinalNewline } from "../utils/text.js";

const CATEGORY_LINE = /^\[\[(?:Category|分类|分類):([^\]\n|]+)(?:\|([^\]\n]*))?\]\][ \t]*$/iu;
const DEFAULTSORT_LINE = /^\{\{(?:DEFAULTSORT|DEFAULTSORTKEY|デフォルトソート):[^{}\n]+\}\}[ \t]*$/iu;
const BEHAVIOR_SWITCH_NAMES = new Set([
  "notoc",
  "forcetoc",
  "noeditsection",
  "newsectionlink",
  "nonewsectionlink",
  "index",
  "noindex",
]);

export interface FooterDiagnostics {
  behaviorSwitchesMoved: number;
  behaviorSwitchesFormatted: number;
  defaultsortMoved: number;
  categoriesMoved: number;
}

export interface PageFooterResult {
  formatted: string;
  diagnostics: FooterDiagnostics;
}

interface FooterEntry {
  index: number;
  value: string;
}

export function isStandaloneBehaviorSwitchLine(line: string): boolean {
  const match = /^__([A-Z]+)__[ \t]*$/iu.exec(line);
  return match?.[1] !== undefined && BEHAVIOR_SWITCH_NAMES.has(match[1].toLowerCase());
}

function lineDetails(source: string, start: number): { index: number; line: string } {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = source.indexOf("\n", start);
  const lineEnd = nextNewline < 0 ? source.length : nextNewline;
  return {
    index: source.slice(0, lineStart).split("\n").length - 1,
    line: source.slice(lineStart, lineEnd),
  };
}

function countMoved(entries: readonly FooterEntry[], outputLines: readonly string[]): number {
  let cursor = 0;
  let moved = 0;
  for (const entry of entries) {
    const outputIndex = outputLines.findIndex((line, index) => index >= cursor && line === entry.value);
    if (outputIndex < 0 || outputIndex !== entry.index) moved++;
    if (outputIndex >= 0) cursor = outputIndex + 1;
  }
  return moved;
}

export function formatPageFooter(
  source: string,
  config: Config,
  options: Pick<
    ResolvedFormatOptions,
    "formatCategories" | "formatBehaviorSwitches" | "behaviorSwitchPlacement"
  >,
): PageFooterResult {
  const diagnostics: FooterDiagnostics = {
    behaviorSwitchesMoved: 0,
    behaviorSwitchesFormatted: 0,
    defaultsortMoved: 0,
    categoriesMoved: 0,
  };
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const root = parseWikitext(source, config);

  const categories: FooterEntry[] = [];
  const categoryIndexes = new Set<number>();
  if (options.formatCategories) {
    for (const node of root.querySelectorAll("category")) {
      if (node.parentNode?.closest("template")) continue;
      const details = lineDetails(source, node.getAbsoluteIndex());
      if (!CATEGORY_LINE.test(details.line) || categoryIndexes.has(details.index)) continue;
      categories.push({ index: details.index, value: details.line.trimEnd() });
      categoryIndexes.add(details.index);
    }
  }

  const defaultsorts: FooterEntry[] = [];
  const defaultsortIndexes = new Set<number>();
  if (options.formatCategories) {
    for (const node of root.querySelectorAll("magic-word")) {
      if (node.name !== "defaultsort" || node.parentNode?.closest("template")) continue;
      const details = lineDetails(source, node.getAbsoluteIndex());
      if (!DEFAULTSORT_LINE.test(details.line) || defaultsortIndexes.has(details.index)) continue;
      defaultsorts.push({ index: details.index, value: details.line.trimEnd() });
      defaultsortIndexes.add(details.index);
    }
  }

  const behaviorSwitches: FooterEntry[] = [];
  const behaviorSwitchIndexes = new Set<number>();
  if (options.formatBehaviorSwitches) {
    for (const node of root.querySelectorAll("double-underscore")) {
      if (!BEHAVIOR_SWITCH_NAMES.has(node.name) || node.parentNode?.closest("template")) continue;
      const details = lineDetails(source, node.getAbsoluteIndex());
      if (!isStandaloneBehaviorSwitchLine(details.line) || behaviorSwitchIndexes.has(details.index)) continue;
      const value = details.line.trimEnd();
      if (value !== details.line) diagnostics.behaviorSwitchesFormatted++;
      behaviorSwitches.push({ index: details.index, value });
      behaviorSwitchIndexes.add(details.index);
    }
  }

  if (categories.length === 0 && defaultsorts.length === 0 && options.behaviorSwitchPlacement === "preserve") {
    for (const entry of behaviorSwitches) lines[entry.index] = entry.value;
    return { formatted: withFinalNewline(lines.join("\n"), finalNewline), diagnostics };
  }

  const movedBehaviorSwitches = options.behaviorSwitchPlacement === "footer"
    ? behaviorSwitches.filter((entry, index, entries) => entries.findIndex(({ value }) => value === entry.value) === index)
    : [];
  const removedIndexes = new Set([...categoryIndexes, ...defaultsortIndexes]);
  if (options.behaviorSwitchPlacement === "footer") {
    for (const index of behaviorSwitchIndexes) removedIndexes.add(index);
  }

  const bodyLines = lines.filter((_, index) => !removedIndexes.has(index));
  if (options.behaviorSwitchPlacement === "preserve") {
    for (const entry of behaviorSwitches) {
      const removedBefore = [...removedIndexes].filter((index) => index < entry.index).length;
      bodyLines[entry.index - removedBefore] = entry.value;
    }
  }
  const body = bodyLines.join("\n").replace(/^(?:[ \t]*\n)+/u, "").trimEnd();
  const groups: string[] = [];
  if (body) groups.push(body);
  if (movedBehaviorSwitches.length > 0) groups.push(movedBehaviorSwitches.map(({ value }) => value).join("\n"));
  const metadata = [...defaultsorts, ...categories].map(({ value }) => value).join("\n");
  if (metadata) groups.push(metadata);
  const formatted = withFinalNewline(groups.join("\n\n"), finalNewline);
  const outputLines = formatted.split("\n");

  if (options.behaviorSwitchPlacement === "footer") {
    diagnostics.behaviorSwitchesMoved = countMoved(behaviorSwitches, outputLines);
  }
  diagnostics.defaultsortMoved = countMoved(defaultsorts, outputLines);
  diagnostics.categoriesMoved = countMoved(categories, outputLines);
  return { formatted, diagnostics };
}

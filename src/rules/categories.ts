import type { Config } from "wikiparser-node";
import { parseWikitext } from "../parser.js";
import { hasFinalNewline, withFinalNewline } from "../utils/text.js";

const CATEGORY_LINE = /^[ \t]*\[\[(?:Category|分类|分類):([^\]\n|]+)(?:\|([^\]\n]*))?\]\][ \t]*$/iu;
const DEFAULTSORT_LINE = /^[ \t]*\{\{DEFAULTSORT:[^{}\n]+\}\}[ \t]*$/iu;

export function formatCategories(source: string, config: Config): string {
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();

  const categories: string[] = [];
  const categoryIndexes = new Set<number>();
  const root = parseWikitext(source, config);
  for (const node of root.querySelectorAll("category")) {
    if (node.parentNode?.closest("template")) continue;
    const start = node.getAbsoluteIndex();
    const lineStart = source.lastIndexOf("\n", start - 1) + 1;
    const nextNewline = source.indexOf("\n", start);
    const lineEnd = nextNewline < 0 ? source.length : nextNewline;
    const line = source.slice(lineStart, lineEnd);
    if (!CATEGORY_LINE.test(line)) continue;
    const index = source.slice(0, lineStart).split("\n").length - 1;
    if (!categoryIndexes.has(index)) categories.push(line.trim());
    categoryIndexes.add(index);
  }
  if (categories.length === 0) return source;

  const defaultSortIndexes = new Set<number>();
  for (const index of categoryIndexes) {
    let previous = index - 1;
    while (previous >= 0 && lines[previous]?.trim() === "") previous--;
    if (previous >= 0 && DEFAULTSORT_LINE.test(lines[previous] ?? "")) {
      defaultSortIndexes.add(previous);
    }
  }

  const defaultSorts = [...defaultSortIndexes].sort((a, b) => a - b).map((index) => lines[index]!.trim());
  const body = lines
    .filter((_, index) => !categoryIndexes.has(index) && !defaultSortIndexes.has(index))
    .join("\n")
    .trimEnd();
  const metadata = [...defaultSorts, ...categories].join("\n");
  const result = body ? `${body}\n\n${metadata}` : metadata;
  return withFinalNewline(result, finalNewline);
}

import type { Config } from "wikiparser-node";
import type { ResolvedFormatOptions } from "../options.js";
import { parseWikitext } from "../parser.js";

interface Replacement {
  start: number;
  end: number;
  value: string;
}

export type TableFormatResult =
  | { changed: true; value: string }
  | { changed: false; reason: string };

export interface TableDiagnostic {
  start: number;
  end: number;
  line: number;
  changed: boolean;
  reason?: string;
}

export interface TableFormatWithDiagnosticsResult {
  formatted: string;
  diagnostics: TableDiagnostic[];
}

export function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position++) {
    if (source.charCodeAt(position) === 10) line++;
  }
  return line;
}

function splitSimpleCells(content: string, separator: "!!" | "||"): string[] | undefined {
  let bracketDepth = 0;
  let quote: "\"" | "'" | undefined;
  const parts: string[] = [];
  let start = 0;

  for (let index = 0; index < content.length; index++) {
    const character = content[index]!;
    if (quote) {
      if (content.startsWith(separator, index)) return undefined;
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "[") bracketDepth++;
    else if (character === "]") {
      bracketDepth--;
      if (bracketDepth < 0) return undefined;
    }
    if (bracketDepth > 0 && content.startsWith(separator, index)) return undefined;
    if (bracketDepth === 0 && content.startsWith(separator, index)) {
      parts.push(content.slice(start, index).trimEnd());
      start = index + separator.length;
      index += separator.length - 1;
    }
  }

  if (quote || bracketDepth !== 0) return undefined;
  parts.push(content.slice(start).trimEnd());
  return parts.some((part) => part.trim() === "") ? undefined : parts;
}

export function analyzeSimpleTableForTesting(raw: string): TableFormatResult {
  if (/\uE000wikitext-fmt:/u.test(raw)) return { changed: false, reason: "contains protected placeholder" };
  if (/<[a-z!/]/iu.test(raw)) return { changed: false, reason: "contains HTML or extension tag" };
  if (/\{\{|\}\}/u.test(raw)) return { changed: false, reason: "contains template or template-like syntax" };
  const lines = raw.split("\n");
  if (lines.length < 2 || !/^\s*\{\|/u.test(lines[0]!) || !/^\s*\|\}\s*$/u.test(lines.at(-1)!)) {
    return { changed: false, reason: "unbalanced table start or end" };
  }
  if (lines.slice(1).some((line) => /^\s*\{\|/u.test(line))) {
    return { changed: false, reason: "contains nested table" };
  }
  if (lines.slice(1, -1).some((line) => /[{}]/u.test(line))) {
    return { changed: false, reason: "contains ambiguous brace syntax" };
  }

  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (index === 0) {
      output.push(`{|${line.replace(/^\s*\{\|/u, "").trimEnd()}`);
      continue;
    }
    if (index === lines.length - 1) {
      output.push("|}");
      continue;
    }
    if (/^\s*\|-/.test(line)) {
      output.push(line.trimEnd());
      continue;
    }
    if (/^\s*\|\+/.test(line)) {
      output.push(line.trimEnd());
      continue;
    }
    const header = /^\s*!(.*)$/u.exec(line);
    if (header) {
      const cells = splitSimpleCells(header[1]!, "!!");
      if (!cells) return { changed: false, reason: "unsafe header cell separator" };
      output.push(...cells.map((cell) => `!${cell}`));
      continue;
    }
    const data = /^\s*\|(?![-+}])(.*)$/u.exec(line);
    if (data) {
      const cells = splitSimpleCells(data[1]!, "||");
      if (!cells) return { changed: false, reason: "unsafe data cell separator" };
      output.push(...cells.map((cell) => `|${cell}`));
      continue;
    }
    return { changed: false, reason: `unclear table line type at line ${index + 1}` };
  }
  const value = output.join("\n");
  return value === raw
    ? { changed: false, reason: "already formatted" }
    : { changed: true, value };
}

export function formatTablesWithDiagnostics(
  source: string,
  config: Config,
  _options: ResolvedFormatOptions,
): TableFormatWithDiagnosticsResult {
  const root = parseWikitext(source, config);
  const replacements: Replacement[] = [];
  const diagnostics: TableDiagnostic[] = [];
  for (const node of root.querySelectorAll("table")) {
    if (node.parentNode?.closest("table")) continue;
    const start = node.getAbsoluteIndex();
    const raw = node.toString();
    const end = start + raw.length;
    let result: TableFormatResult;
    if (node.parentNode?.closest("template")) {
      result = { changed: false, reason: "table is inside a template" };
    } else if (source.lastIndexOf("\n", start - 1) + 1 !== start) {
      result = { changed: false, reason: "table is not standalone" };
    } else {
      result = analyzeSimpleTableForTesting(raw);
    }
    diagnostics.push({
      start,
      end,
      line: lineNumberAt(source, start),
      changed: result.changed,
      ...(result.changed ? {} : { reason: result.reason }),
    });
    if (result.changed) replacements.push({ start, end, value: result.value });
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  return { formatted: output, diagnostics };
}

export function formatTables(source: string, config: Config, options: ResolvedFormatOptions): string {
  return formatTablesWithDiagnostics(source, config, options).formatted;
}

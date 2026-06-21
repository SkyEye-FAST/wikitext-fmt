import type { Config } from "wikiparser-node";
import type { ResolvedFormatOptions } from "../options.js";
import { parseWikitext } from "../parser.js";

interface Replacement {
  start: number;
  end: number;
  value: string;
}

const PLACEHOLDER = /\uE000wikitext-fmt:/u;
const RISKY_CONTENT = /(?:\{\{|\}\}|<|\uE000wikitext-fmt:)/u;

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

function formatSimpleTable(raw: string): string | undefined {
  if (PLACEHOLDER.test(raw) || RISKY_CONTENT.test(raw)) return undefined;
  const lines = raw.split("\n");
  if (lines.length < 2) return undefined;
  if (!/^\s*\{\|/u.test(lines[0]!) || !/^\s*\|\}\s*$/u.test(lines.at(-1)!)) return undefined;
  if (lines.slice(1).some((line) => /^\s*\{\|/u.test(line))) return undefined;
  if (lines.slice(1, -1).some((line) => /[{}]/u.test(line))) return undefined;

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
      if (!cells) return undefined;
      output.push(...cells.map((cell) => `!${cell}`));
      continue;
    }
    const data = /^\s*\|(?![-+}])(.*)$/u.exec(line);
    if (data) {
      const cells = splitSimpleCells(data[1]!, "||");
      if (!cells) return undefined;
      output.push(...cells.map((cell) => `|${cell}`));
      continue;
    }
    return undefined;
  }
  return output.join("\n");
}

export function formatTables(source: string, config: Config, _options: ResolvedFormatOptions): string {
  const root = parseWikitext(source, config);
  const replacements: Replacement[] = [];
  for (const node of root.querySelectorAll("table")) {
    if (node.parentNode?.closest("table") || node.parentNode?.closest("template")) continue;
    const start = node.getAbsoluteIndex();
    if (source.lastIndexOf("\n", start - 1) + 1 !== start) continue;
    const raw = node.toString();
    const formatted = formatSimpleTable(raw);
    if (formatted === undefined || formatted === raw) continue;
    replacements.push({ start, end: start + raw.length, value: formatted });
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  return output;
}

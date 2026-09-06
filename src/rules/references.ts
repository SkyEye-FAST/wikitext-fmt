import {
  collectNodes,
  isNodeWholeLine,
  lineIndexAt,
  type ParsedDocumentContext,
  type ParserNodeLike,
} from "../parserContext.js";
import { hasFinalNewline, withFinalNewline } from "../utils/text.js";

export interface ReferenceDiagnostics {
  referencesFormatted: number;
  referenceGroupsFormatted: number;
  referenceLinesSkippedUnsafe: number;
}

export interface ReferenceFormatResult {
  formatted: string;
  diagnostics: ReferenceDiagnostics;
}

function emptyReferenceDiagnostics(): ReferenceDiagnostics {
  return {
    referencesFormatted: 0,
    referenceGroupsFormatted: 0,
    referenceLinesSkippedUnsafe: 0,
  };
}

function isReferenceLikeLine(line: string): boolean {
  return /^<(?:ref|references)\b/iu.test(line.trimStart());
}

function hasUnsafeSyntax(line: string): boolean {
  if (line.trimStart() !== line) return true;
  if (
    /(?:\{\{|\}\}|\[\[|\]\]|<!--|#(?:if|switch|expr|invoke|tag):|\uE000wikitext-fmt:)/iu.test(
      line,
    )
  )
    return true;
  if (/^(?:[|!]|[*#:;]|\{\||\|\})/u.test(line)) return true;
  const tags = line.match(/<[^>]+>/gu) ?? [];
  if (tags.length !== 1) return true;
  if ((line.match(/</gu)?.length ?? 0) !== 1) return true;
  if ((line.match(/>/gu)?.length ?? 0) !== 1) return true;
  return false;
}

function hasBalancedQuotes(value: string): boolean {
  let quote: "\"" | "'" | undefined;
  for (const character of value) {
    if (quote !== undefined) {
      // The opposite quote is literal content inside a quoted attribute.
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    }
  }
  return quote === undefined;
}

function formatReferenceLine(
  line: string,
): { value: string; kind: "ref" | "references" } | undefined {
  // Validate an exact single self-closing tag, even for parser-confirmed ranges.
  // Without parser context, the caller must supply a complete standalone line.
  if (hasUnsafeSyntax(line)) return undefined;
  const trimmed = line.trimEnd();
  const match = /^<(ref|references)\b([^<>]*)\/\s*>$/iu.exec(trimmed);
  if (!match?.[1] || match[2] === undefined) return undefined;
  const kind = match[1].toLowerCase() as "ref" | "references";
  const attrs = match[2].replace(/[ \t]+$/u, "");
  if (/\/[ \t]*$/u.test(attrs)) return undefined;
  if (!hasBalancedQuotes(attrs)) return undefined;
  return { value: `<${kind}${attrs} />`, kind };
}

function formatParserReferences(
  source: string,
  context: ParsedDocumentContext,
): ReferenceFormatResult {
  const diagnostics = emptyReferenceDiagnostics();
  const lines = source.split("\n");
  const confirmedLines = new Set<number>();
  const unsafeLines = new Set<number>();
  const replacements: { start: number; end: number; value: string }[] = [];
  for (const node of collectNodes(context, "ext")) {
    const text = node.toString();
    if (!/^<(?:ref|references)\b/iu.test(text)) continue;
    const start = node.getAbsoluteIndex();
    const end = start + text.length;
    const index = lineIndexAt(context, start);
    confirmedLines.add(index);
    const line = lines[index]!;
    const wholeLine = isNodeWholeLine(context, node) && line.startsWith("<");
    const parent = (node as ParserNodeLike & { parentNode?: unknown }).parentNode;
    // Inline nodes must belong directly to the document. Template values, link
    // labels, attributes, table cells, and other nested containers stay opaque.
    if (
      start < 0 ||
      end > source.length ||
      source.slice(start, end) !== text ||
      /[\r\n]/u.test(text) ||
      (!wholeLine && parent !== context.root)
    ) {
      unsafeLines.add(index);
      continue;
    }
    const candidate = wholeLine ? line : text;
    const formatted = formatReferenceLine(candidate);
    if (!formatted) {
      unsafeLines.add(index);
      continue;
    }
    if (formatted.value === candidate) continue;
    replacements.push({
      start,
      end: wholeLine ? context.lineStarts[index]! + line.length : end,
      value: formatted.value,
    });
    diagnostics.referencesFormatted++;
    if (formatted.kind === "references") diagnostics.referenceGroupsFormatted++;
  }
  for (let index = 0; index < lines.length; index++) {
    if (!confirmedLines.has(index) && isReferenceLikeLine(lines[index]!)) {
      unsafeLines.add(index);
    }
  }
  diagnostics.referenceLinesSkippedUnsafe = unsafeLines.size;
  let cursor = 0;
  const output: string[] = [];
  for (const replacement of replacements.sort((a, b) => a.start - b.start)) {
    output.push(source.slice(cursor, replacement.start), replacement.value);
    cursor = replacement.end;
  }
  output.push(source.slice(cursor));
  return { formatted: output.join(""), diagnostics };
}

export function formatReferences(
  source: string,
  context?: ParsedDocumentContext,
): ReferenceFormatResult {
  if (context?.source === source) return formatParserReferences(source, context);
  const diagnostics = emptyReferenceDiagnostics();
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  let changed = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const formatted = formatReferenceLine(line);
    if (!formatted) {
      if (isReferenceLikeLine(line)) diagnostics.referenceLinesSkippedUnsafe++;
      continue;
    }
    if (formatted.value === line) continue;
    lines[index] = formatted.value;
    changed = true;
    diagnostics.referencesFormatted++;
    if (formatted.kind === "references") diagnostics.referenceGroupsFormatted++;
  }

  return {
    formatted: changed
      ? withFinalNewline(lines.join("\n"), finalNewline)
      : source,
    diagnostics,
  };
}

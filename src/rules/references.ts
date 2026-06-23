import {
  collectNodes,
  isNodeWholeLine,
  lineIndexAt,
  type ParsedDocumentContext,
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
  const doubleQuotes = value.match(/"/gu)?.length ?? 0;
  const singleQuotes = value.match(/'/gu)?.length ?? 0;
  return doubleQuotes % 2 === 0 && singleQuotes % 2 === 0;
}

function formatReferenceLine(
  line: string,
): { value: string; kind: "ref" | "references" } | undefined {
  // wikiparser-node exposes ref/references as extension nodes, but the rule's
  // safety boundary depends on exact source syntax: standalone, single tag,
  // self-closing, and no content-bearing ref body. Keep this source-line check
  // rather than relying only on ext node shape.
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

function parserReferenceLineIndexes(
  source: string,
  context?: ParsedDocumentContext,
): Set<number> | undefined {
  if (context?.source !== source) return undefined;
  const lineIndexes = new Set<number>();
  for (const node of collectNodes(context, "ext")) {
    if (!isNodeWholeLine(context, node)) continue;
    const text = node.toString();
    if (!/^<(?:ref|references)\b/iu.test(text)) continue;
    lineIndexes.add(lineIndexAt(context, node.getAbsoluteIndex()));
  }
  return lineIndexes;
}

export function formatReferences(
  source: string,
  context?: ParsedDocumentContext,
): ReferenceFormatResult {
  const diagnostics = emptyReferenceDiagnostics();
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const parserConfirmedLines = parserReferenceLineIndexes(source, context);
  let changed = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (parserConfirmedLines && !parserConfirmedLines.has(index)) {
      if (isReferenceLikeLine(line)) diagnostics.referenceLinesSkippedUnsafe++;
      continue;
    }
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

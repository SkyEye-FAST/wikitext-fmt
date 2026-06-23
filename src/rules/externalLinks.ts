import {
  collectNodes,
  isNodeWholeLine,
  nodeRange,
  type ParsedDocumentContext,
  type SourceRange,
} from "../parserContext.js";

export interface ExternalLinkDiagnostics {
  externalLinksFormatted: number;
  externalLinksSkippedUnsafe: number;
}

export interface ExternalLinkFormatResult {
  formatted: string;
  diagnostics: ExternalLinkDiagnostics;
}

interface Replacement extends SourceRange {
  value: string;
}

function emptyExternalLinkDiagnostics(): ExternalLinkDiagnostics {
  return {
    externalLinksFormatted: 0,
    externalLinksSkippedUnsafe: 0,
  };
}

function hasUnsafeExternalLinkText(raw: string): boolean {
  return /(?:\{\{|\}\}|\[\[|\]\]|<[A-Za-z!/]|[\uE000\uE001])/u.test(raw);
}

function normalizeStandaloneExternalLink(raw: string): string | undefined {
  if (hasUnsafeExternalLinkText(raw)) return undefined;
  const match = /^\[([^\s\[\]{}<>]+)([ \t]+)([^\]\n]+)\]$/u.exec(raw);
  if (!match?.[1] || match[3] === undefined) return undefined;
  if (match[2] === " ") return raw;
  return `[${match[1]} ${match[3]}]`;
}

export function formatExternalLinks(
  source: string,
  context?: ParsedDocumentContext,
): ExternalLinkFormatResult {
  const diagnostics = emptyExternalLinkDiagnostics();
  if (context?.source !== source) return { formatted: source, diagnostics };

  const replacements: Replacement[] = [];
  for (const node of collectNodes(context, "ext-link")) {
    if (!isNodeWholeLine(context, node)) continue;
    const raw = node.toString();
    const formatted = normalizeStandaloneExternalLink(raw);
    if (!formatted) {
      diagnostics.externalLinksSkippedUnsafe++;
      continue;
    }
    if (formatted === raw) continue;
    replacements.push({ ...nodeRange(node), value: formatted });
    diagnostics.externalLinksFormatted++;
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, replacement.start) +
      replacement.value +
      output.slice(replacement.end);
  }

  return { formatted: output, diagnostics };
}

import type { ResolvedFormatOptions } from "../options.js";
import { resolveLocalizationAliases } from "../localization/aliases.js";
import {
  collectNodes,
  isNodeWholeLine,
  lineIndexAt,
  type ParsedDocumentContext,
} from "../parserContext.js";
import { hasFinalNewline, withFinalNewline } from "../utils/text.js";

export interface RedirectDiagnostics {
  redirectsFormatted: number;
  localizedRedirectAliasesCanonicalized: number;
}

export interface RedirectFormatResult {
  formatted: string;
  diagnostics: RedirectDiagnostics;
}

function emptyRedirectDiagnostics(): RedirectDiagnostics {
  return {
    redirectsFormatted: 0,
    localizedRedirectAliasesCanonicalized: 0,
  };
}

function normalizeRedirectAlias(alias: string): string {
  return alias.startsWith("#") || alias.startsWith("＃") ? alias : `#${alias}`;
}

function redirectAliases(
  options: Pick<
    ResolvedFormatOptions,
    "localizationSource" | "localizationAliases"
  >,
): string[] {
  return resolveLocalizationAliases(
    options.localizationSource,
    options.localizationAliases,
  )
    .redirectMagicWords.map(normalizeRedirectAlias)
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function safeRedirectTarget(link: string): boolean {
  const match = /^\[\[([^\]\n]+)\]\]$/u.exec(link);
  if (!match?.[1]) return false;
  const target = match[1];
  if (/[\[\]{}<>|]/u.test(target)) return false;
  return target.trim().length > 0;
}

function formatRedirectLine(
  line: string,
  aliases: readonly string[],
  canonicalEnglish: boolean,
): { value: string; canonicalized: boolean } | undefined {
  if (line.trimStart() !== line || /<|>/u.test(line)) return undefined;
  for (const alias of aliases) {
    if (!line.startsWith(alias)) continue;
    const rest = line.slice(alias.length);
    const match = /^(?:[ \t]*)(\[\[[^\]\n]+\]\])[ \t]*$/u.exec(rest);
    if (!match?.[1] || !safeRedirectTarget(match[1])) continue;
    const keyword = canonicalEnglish ? "#REDIRECT" : alias;
    return {
      value: `${keyword} ${match[1]}`,
      canonicalized: canonicalEnglish && keyword !== alias,
    };
  }
  return undefined;
}

function firstMeaningfulLineIndex(lines: readonly string[]): number {
  return lines.findIndex((line) => line.trim() !== "");
}

function parserRedirectLineIndex(
  source: string,
  context?: ParsedDocumentContext,
): number | undefined {
  if (context?.source !== source) return undefined;
  const [syntax] = collectNodes(context, "redirect-syntax");
  if (syntax) return lineIndexAt(context, syntax.getAbsoluteIndex());
  for (const node of collectNodes(context, "redirect")) {
    if (!isNodeWholeLine(context, node)) continue;
    return lineIndexAt(context, node.getAbsoluteIndex());
  }
  return undefined;
}

export function formatRedirects(
  source: string,
  options: Pick<
    ResolvedFormatOptions,
    "localizationSource" | "localizedSyntaxStyle" | "localizationAliases"
  >,
  context?: ParsedDocumentContext,
): RedirectFormatResult {
  const diagnostics = emptyRedirectDiagnostics();
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const index = firstMeaningfulLineIndex(lines);
  if (index < 0) return { formatted: source, diagnostics };
  const parserIndex = parserRedirectLineIndex(source, context);
  if (parserIndex !== undefined && parserIndex !== index)
    return { formatted: source, diagnostics };

  const formatted = formatRedirectLine(
    lines[index]!,
    redirectAliases(options),
    options.localizedSyntaxStyle === "canonical-english",
  );
  if (!formatted) return { formatted: source, diagnostics };

  if (formatted.value !== lines[index]) {
    diagnostics.redirectsFormatted = 1;
    if (formatted.canonicalized)
      diagnostics.localizedRedirectAliasesCanonicalized = 1;
    lines[index] = formatted.value;
  }
  return {
    formatted: withFinalNewline(lines.join("\n"), finalNewline),
    diagnostics,
  };
}

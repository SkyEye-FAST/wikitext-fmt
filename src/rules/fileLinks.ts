import { resolveLocalizationAliases } from "../localization/aliases.js";
import type { ResolvedFormatOptions } from "../options.js";
import { hasFinalNewline, withFinalNewline } from "../utils/text.js";

export interface FileLinkDiagnostics {
  fileLinksFormatted: number;
  localizedFileNamespaceAliasesCanonicalized: number;
  localizedImageOptionsCanonicalized: number;
}

export interface FileLinkFormatResult {
  formatted: string;
  diagnostics: FileLinkDiagnostics;
}

type FileLinkOptions = Pick<
  ResolvedFormatOptions,
  "localizationSource" | "localizedSyntaxStyle" | "localizationAliases"
>;

const canonicalOptionById: Record<string, string> = {
  img_thumbnail: "thumb",
  img_manualthumb: "thumbnail=",
  img_framed: "frame",
  img_frameless: "frameless",
  img_border: "border",
  img_left: "left",
  img_right: "right",
  img_center: "center",
  img_none: "none",
  img_alt: "alt=",
  img_link: "link=",
  img_page: "page=",
  img_upright: "upright",
  img_class: "class=",
  img_lang: "lang=",
};

function emptyFileLinkDiagnostics(): FileLinkDiagnostics {
  return {
    fileLinksFormatted: 0,
    localizedFileNamespaceAliasesCanonicalized: 0,
    localizedImageOptionsCanonicalized: 0,
  };
}

function hasRiskySyntax(value: string): boolean {
  return /(?:\{\{|\}\}|\[\[|\]\]|<[A-Za-z!/]|^\s*[{|!])/u.test(value);
}

function splitFileLink(line: string): string[] | undefined {
  const trimmed = line.replace(/[ \t]+$/u, "");
  const match = /^\[\[([^\n]+)\]\]$/u.exec(trimmed);
  if (!match?.[1]) return undefined;
  const inner = match[1];
  if (hasRiskySyntax(inner)) return undefined;
  const parts = inner.split("|");
  if (parts.length === 0 || parts.some((part) => part.length === 0))
    return undefined;
  return parts;
}

function fileNamespaceAliases(options: FileLinkOptions): string[] {
  const aliases = resolveLocalizationAliases(
    options.localizationSource,
    options.localizationAliases,
  ).fileNamespaces;
  return [...new Set(aliases)].sort((a, b) => b.length - a.length);
}

function normalizeNamespaceAlias(value: string): string {
  return value.replaceAll("_", " ").toLocaleLowerCase();
}

function imageOptionAliasMap(options: FileLinkOptions): Map<string, string> {
  const aliases = resolveLocalizationAliases(
    options.localizationSource,
    options.localizationAliases,
  ).imageOptionAliases;
  const result = new Map<string, string>();
  for (const [id, values] of Object.entries(aliases)) {
    const canonical = canonicalOptionById[id];
    if (!canonical || id === "img_width") continue;
    for (const value of values) {
      if (!value || value === "0" || value === "1") continue;
      result.set(value, canonical);
    }
  }
  return result;
}

function parseFileTarget(
  target: string,
  namespaceAliases: readonly string[],
): { namespace: string; title: string } | undefined {
  const separator = target.indexOf(":");
  if (separator <= 0) return undefined;
  const namespace = target.slice(0, separator);
  const title = target.slice(separator + 1);
  if (!title || /[{}<>[\]\n]/u.test(title)) return undefined;
  const normalizedAliases = new Set(
    namespaceAliases.map((alias) => normalizeNamespaceAlias(alias)),
  );
  if (!normalizedAliases.has(normalizeNamespaceAlias(namespace)))
    return undefined;
  return { namespace, title };
}

function canonicalizeOption(
  value: string,
  aliasMap: Map<string, string>,
): string {
  const exact = aliasMap.get(value);
  if (exact && !exact.endsWith("=")) return exact;

  const parameterizedAliases = [...aliasMap].sort(([a], [b]) => {
    const [aPrefix = ""] = a.split("$1");
    const [bPrefix = ""] = b.split("$1");
    return bPrefix.length - aPrefix.length;
  });
  for (const [alias, canonical] of parameterizedAliases) {
    if (!alias.includes("$1")) continue;
    const [prefix, suffix = ""] = alias.split("$1");
    if (!prefix || !value.startsWith(prefix) || !value.endsWith(suffix))
      continue;
    const parameter = value.slice(prefix.length, value.length - suffix.length);
    if (!parameter || /[{}<>[\]\n|]/u.test(parameter)) continue;
    return `${canonical.endsWith("=") ? canonical : `${canonical}=`}${parameter}`;
  }

  if (exact?.endsWith("=")) return value;
  return value;
}

function formatFileLinkLine(
  line: string,
  options: FileLinkOptions,
):
  | {
      value: string;
      namespaceCanonicalized: boolean;
      imageOptionsCanonicalized: number;
    }
  | undefined {
  const parts = splitFileLink(line);
  if (!parts) return undefined;
  const namespaceAliases = fileNamespaceAliases(options);
  const target = parseFileTarget(parts[0]!, namespaceAliases);
  if (!target) return undefined;

  const canonicalEnglish = options.localizedSyntaxStyle === "canonical-english";
  let namespaceCanonicalized = false;
  let imageOptionsCanonicalized = 0;
  const outputParts = [...parts];
  if (canonicalEnglish && target.namespace !== "File") {
    outputParts[0] = `File:${target.title}`;
    namespaceCanonicalized = true;
  }

  if (canonicalEnglish) {
    const aliasMap = imageOptionAliasMap(options);
    for (let index = 1; index < outputParts.length; index++) {
      const original = outputParts[index]!;
      const canonicalized = canonicalizeOption(original, aliasMap);
      if (canonicalized !== original) {
        outputParts[index] = canonicalized;
        imageOptionsCanonicalized++;
      }
    }
  }

  return {
    value: `[[${outputParts.join("|")}]]`,
    namespaceCanonicalized,
    imageOptionsCanonicalized,
  };
}

export function formatFileLinks(
  source: string,
  options: FileLinkOptions,
): FileLinkFormatResult {
  const diagnostics = emptyFileLinkDiagnostics();
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();

  let changed = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const formatted = formatFileLinkLine(line, options);
    if (!formatted || formatted.value === line) continue;
    lines[index] = formatted.value;
    changed = true;
    diagnostics.fileLinksFormatted++;
    if (formatted.namespaceCanonicalized)
      diagnostics.localizedFileNamespaceAliasesCanonicalized++;
    diagnostics.localizedImageOptionsCanonicalized +=
      formatted.imageOptionsCanonicalized;
  }

  return {
    formatted: changed
      ? withFinalNewline(lines.join("\n"), finalNewline)
      : source,
    diagnostics,
  };
}

import type { Config } from "wikiparser-node";
import type { ResolvedFormatOptions } from "../options.js";
import {
  behaviorSwitchIds,
  resolveLocalizationAliases,
  type BehaviorSwitchId,
} from "../localization/aliases.js";
import { parseWikitext } from "../parser.js";
import { hasFinalNewline, withFinalNewline } from "../utils/text.js";

export interface FooterDiagnostics {
  behaviorSwitchesMoved: number;
  behaviorSwitchesFormatted: number;
  defaultsortMoved: number;
  categoriesMoved: number;
  localizedCategoryAliasesCanonicalized: number;
  localizedDefaultsortAliasesCanonicalized: number;
  localizedBehaviorSwitchesCanonicalized: number;
}

export interface PageFooterResult {
  formatted: string;
  diagnostics: FooterDiagnostics;
}

interface FooterEntry {
  index: number;
  value: string;
  originalValue: string;
}

function behaviorAliasToken(alias: string): string {
  return /^(?:__.*__|＿＿.*＿＿)$/u.test(alias) ? alias : `__${alias}__`;
}

function behaviorLookup(
  aliases: ReturnType<typeof resolveLocalizationAliases>["behaviorSwitches"],
): Map<string, BehaviorSwitchId> {
  const candidates = new Map<string, BehaviorSwitchId | undefined>();
  for (const [id, values] of Object.entries(aliases) as Array<
    [BehaviorSwitchId, string[]]
  >) {
    for (const value of values) {
      const token = behaviorAliasToken(value);
      const previous = candidates.get(token);
      candidates.set(
        token,
        previous === undefined && !candidates.has(token) ? id
        : previous === id ? id
        : undefined,
      );
    }
  }
  return new Map(
    [...candidates].filter(
      (entry): entry is [string, BehaviorSwitchId] => entry[1] !== undefined,
    ),
  );
}

export function isStandaloneBehaviorSwitchLine(
  line: string,
  aliases?: Map<string, BehaviorSwitchId>,
): boolean {
  const trimmed = line.trimEnd();
  if (trimmed.length === 0 || line.trimStart() !== line) return false;
  if (aliases) return aliases.has(trimmed);
  return behaviorSwitchIds.some((id) => trimmed === `__${id.toUpperCase()}__`);
}

function templateRanges(
  source: string,
  config: Config,
): Array<{ start: number; end: number }> {
  return parseWikitext(source, config)
    .querySelectorAll("template")
    .map((node) => ({
      start: node.getAbsoluteIndex(),
      end: node.getAbsoluteIndex() + node.toString().length,
    }));
}

function isInsideTemplate(
  start: number,
  end: number,
  ranges: ReadonlyArray<{ start: number; end: number }>,
): boolean {
  return ranges.some(
    (range) =>
      range.start <= start &&
      range.end >= end &&
      (range.start < start || range.end > end),
  );
}

function matchCategory(
  line: string,
  aliases: ReadonlySet<string>,
  canonicalEnglish: boolean,
): { value: string; canonicalized: boolean } | undefined {
  const match = /^\[\[([^:\]\n]+):([^\]\n|]+(?:\|[^\]\n]*)?)\]\][ \t]*$/u.exec(
    line,
  );
  if (
    !match?.[1] ||
    match[2] === undefined ||
    !aliases.has(match[1].replaceAll("_", " ").toLocaleLowerCase())
  ) {
    return undefined;
  }
  const namespace = canonicalEnglish ? "Category" : match[1];
  return {
    value: `[[${namespace}:${match[2]}]]`,
    canonicalized: canonicalEnglish && namespace !== match[1],
  };
}

function matchDefaultsort(
  line: string,
  aliases: readonly string[],
  canonicalEnglish: boolean,
): { value: string; canonicalized: boolean } | undefined {
  const trimmed = line.trimEnd();
  for (const alias of aliases) {
    const prefix = `{{${alias}`;
    if (!trimmed.startsWith(prefix) || !trimmed.endsWith("}}")) continue;
    const value = trimmed.slice(prefix.length, -2);
    if (!value || /[{}\n]/u.test(value)) return undefined;
    const keyword = canonicalEnglish ? "DEFAULTSORT:" : alias;
    return {
      value: `{{${keyword}${value}}}`,
      canonicalized: canonicalEnglish && keyword !== alias,
    };
  }
  return undefined;
}

function countMoved(
  entries: readonly FooterEntry[],
  outputLines: readonly string[],
): number {
  let cursor = 0;
  let moved = 0;
  for (const entry of entries) {
    const outputIndex = outputLines.findIndex(
      (line, index) => index >= cursor && line === entry.value,
    );
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
    | "formatCategories"
    | "formatBehaviorSwitches"
    | "behaviorSwitchPlacement"
    | "localizationSource"
    | "localizedSyntaxStyle"
    | "localizationAliases"
  >,
): PageFooterResult {
  const diagnostics: FooterDiagnostics = {
    behaviorSwitchesMoved: 0,
    behaviorSwitchesFormatted: 0,
    defaultsortMoved: 0,
    categoriesMoved: 0,
    localizedCategoryAliasesCanonicalized: 0,
    localizedDefaultsortAliasesCanonicalized: 0,
    localizedBehaviorSwitchesCanonicalized: 0,
  };
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const aliases = resolveLocalizationAliases(
    options.localizationSource,
    options.localizationAliases,
  );
  const categoryAliases = new Set(
    aliases.categoryNamespaces.map((alias) =>
      alias.replaceAll("_", " ").toLocaleLowerCase(),
    ),
  );
  const switchAliases = behaviorLookup(aliases.behaviorSwitches);
  const canonicalEnglish = options.localizedSyntaxStyle === "canonical-english";
  const ranges = templateRanges(source, config);
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const categories: FooterEntry[] = [];
  const categoryIndexes = new Set<number>();
  if (options.formatCategories) {
    for (const [index, line] of lines.entries()) {
      const value = matchCategory(line, categoryAliases, canonicalEnglish);
      const start = lineStarts[index] ?? 0;
      if (
        !value ||
        isInsideTemplate(start, start + line.trimEnd().length, ranges)
      )
        continue;
      if (value.canonicalized)
        diagnostics.localizedCategoryAliasesCanonicalized++;
      categories.push({
        index,
        value: value.value,
        originalValue: line.trimEnd(),
      });
      categoryIndexes.add(index);
    }
  }

  const defaultsorts: FooterEntry[] = [];
  const defaultsortIndexes = new Set<number>();
  if (options.formatCategories) {
    for (const [index, line] of lines.entries()) {
      const value = matchDefaultsort(
        line,
        aliases.defaultsortMagicWords,
        canonicalEnglish,
      );
      const start = lineStarts[index] ?? 0;
      if (
        !value ||
        isInsideTemplate(start, start + line.trimEnd().length, ranges)
      )
        continue;
      if (value.canonicalized)
        diagnostics.localizedDefaultsortAliasesCanonicalized++;
      defaultsorts.push({
        index,
        value: value.value,
        originalValue: line.trimEnd(),
      });
      defaultsortIndexes.add(index);
    }
  }

  const behaviorSwitches: FooterEntry[] = [];
  const behaviorSwitchIndexes = new Set<number>();
  if (options.formatBehaviorSwitches) {
    for (const [index, line] of lines.entries()) {
      const originalValue = line.trimEnd();
      const id = switchAliases.get(originalValue);
      const start = lineStarts[index] ?? 0;
      if (!id || isInsideTemplate(start, start + originalValue.length, ranges))
        continue;
      const value =
        canonicalEnglish ? `__${id.toUpperCase()}__` : originalValue;
      if (value !== line) diagnostics.behaviorSwitchesFormatted++;
      if (canonicalEnglish && value !== originalValue)
        diagnostics.localizedBehaviorSwitchesCanonicalized++;
      behaviorSwitches.push({ index, value, originalValue });
      behaviorSwitchIndexes.add(index);
    }
  }

  if (
    categories.length === 0 &&
    defaultsorts.length === 0 &&
    options.behaviorSwitchPlacement === "preserve"
  ) {
    for (const entry of behaviorSwitches) lines[entry.index] = entry.value;
    return {
      formatted: withFinalNewline(lines.join("\n"), finalNewline),
      diagnostics,
    };
  }

  const movedBehaviorSwitches =
    options.behaviorSwitchPlacement === "footer" ?
      behaviorSwitches.filter(
        (entry, index, entries) =>
          entries.findIndex(
            ({ originalValue, value }) =>
              (canonicalEnglish ? value : originalValue) ===
              (canonicalEnglish ? entry.value : entry.originalValue),
          ) === index,
      )
    : [];
  const removedIndexes = new Set([...categoryIndexes, ...defaultsortIndexes]);
  if (options.behaviorSwitchPlacement === "footer") {
    for (const index of behaviorSwitchIndexes) removedIndexes.add(index);
  }

  const bodyLines = lines.filter((_, index) => !removedIndexes.has(index));
  if (options.behaviorSwitchPlacement === "preserve") {
    for (const entry of behaviorSwitches) {
      const removedBefore = [...removedIndexes].filter(
        (index) => index < entry.index,
      ).length;
      bodyLines[entry.index - removedBefore] = entry.value;
    }
  }
  const body = bodyLines
    .join("\n")
    .replace(/^(?:[ \t]*\n)+/u, "")
    .trimEnd();
  const groups: string[] = [];
  if (body) groups.push(body);
  if (movedBehaviorSwitches.length > 0)
    groups.push(movedBehaviorSwitches.map(({ value }) => value).join("\n"));
  const metadata = [...defaultsorts, ...categories]
    .map(({ value }) => value)
    .join("\n");
  if (metadata) groups.push(metadata);
  const formatted = withFinalNewline(groups.join("\n\n"), finalNewline);
  const outputLines = formatted.split("\n");

  if (options.behaviorSwitchPlacement === "footer") {
    diagnostics.behaviorSwitchesMoved = countMoved(
      behaviorSwitches,
      outputLines,
    );
  }
  diagnostics.defaultsortMoved = countMoved(defaultsorts, outputLines);
  diagnostics.categoriesMoved = countMoved(categories, outputLines);
  return { formatted, diagnostics };
}

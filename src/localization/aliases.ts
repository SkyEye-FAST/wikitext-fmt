import builtinData from "./generated/mediawiki-aliases.json" with { type: "json" };
import type { LocalizationAliases, LocalizationSource } from "../options.js";

export const behaviorSwitchIds = [
  "notoc",
  "forcetoc",
  "toc",
  "noeditsection",
  "newsectionlink",
  "nonewsectionlink",
  "index",
  "noindex",
  "nogallery",
  "hiddencat",
  "nocontentconvert",
  "notitleconvert",
  "staticredirect",
] as const;

export type BehaviorSwitchId = (typeof behaviorSwitchIds)[number];

export interface ResolvedLocalizationAliases {
  categoryNamespaces: string[];
  defaultsortMagicWords: string[];
  behaviorSwitches: Record<BehaviorSwitchId, string[]>;
}

const behaviorIdSet = new Set<string>(behaviorSwitchIds);

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function canonicalAliases(): ResolvedLocalizationAliases {
  return {
    categoryNamespaces: ["Category"],
    defaultsortMagicWords: ["DEFAULTSORT:", "DEFAULTSORTKEY:"],
    behaviorSwitches: Object.fromEntries(
      behaviorSwitchIds.map((id) => [id, [`__${id.toUpperCase()}__`]]),
    ) as Record<BehaviorSwitchId, string[]>,
  };
}

export function mergeLocalizationAliases(
  ...sources: Array<LocalizationAliases | undefined>
): LocalizationAliases {
  const result: LocalizationAliases = {};
  for (const source of sources) {
    if (!source) continue;
    if (source.categoryNamespaces) {
      result.categoryNamespaces = unique([
        ...(result.categoryNamespaces ?? []),
        ...source.categoryNamespaces,
      ]);
    }
    if (source.defaultsortMagicWords) {
      result.defaultsortMagicWords = unique([
        ...(result.defaultsortMagicWords ?? []),
        ...source.defaultsortMagicWords,
      ]);
    }
    if (source.behaviorSwitches) {
      result.behaviorSwitches ??= {};
      for (const [id, aliases] of Object.entries(source.behaviorSwitches)) {
        if (!behaviorIdSet.has(id)) continue;
        result.behaviorSwitches[id] = unique([
          ...(result.behaviorSwitches[id] ?? []),
          ...aliases,
        ]);
      }
    }
  }
  return result;
}

function normalizedBehaviorAlias(alias: string): string {
  return /^(?:__.*__|＿＿.*＿＿)$/u.test(alias) ? alias : `__${alias}__`;
}

export function overrideLocalizationAliases(
  base: LocalizationAliases,
  override: LocalizationAliases | undefined,
): LocalizationAliases {
  const result = mergeLocalizationAliases(base, {
    categoryNamespaces: override?.categoryNamespaces,
    defaultsortMagicWords: override?.defaultsortMagicWords,
  });
  result.behaviorSwitches = Object.fromEntries(
    Object.entries(base.behaviorSwitches ?? {}).map(([id, aliases]) => [
      id,
      [...aliases],
    ]),
  );
  for (const [id, aliases] of Object.entries(
    override?.behaviorSwitches ?? {},
  )) {
    for (const alias of aliases) {
      const token = normalizedBehaviorAlias(alias);
      for (const [existingId, existingAliases] of Object.entries(
        result.behaviorSwitches,
      )) {
        result.behaviorSwitches[existingId] = existingAliases.filter(
          (existing) => normalizedBehaviorAlias(existing) !== token,
        );
      }
      result.behaviorSwitches[id] = unique([
        ...(result.behaviorSwitches[id] ?? []),
        alias,
      ]);
    }
  }
  return result;
}

export function resolveLocalizationAliases(
  source: LocalizationSource,
  customAliases: LocalizationAliases,
): ResolvedLocalizationAliases {
  const hasAliasData =
    (customAliases.categoryNamespaces?.length ?? 0) > 0 ||
    (customAliases.defaultsortMagicWords?.length ?? 0) > 0 ||
    Object.values(customAliases.behaviorSwitches ?? {}).some(
      (aliases) => aliases.length > 0,
    );
  if (source === "siteinfo" && !hasAliasData) {
    throw new Error(
      "Siteinfo localization aliases were not loaded; use the CLI with --site-api",
    );
  }
  const base = canonicalAliases();
  const selected =
    source === "builtin" ?
      overrideLocalizationAliases(
        mergeLocalizationAliases(base, builtinData),
        customAliases,
      )
    : overrideLocalizationAliases(base, customAliases);
  const merged = mergeLocalizationAliases(selected);
  const behaviorSwitches = Object.fromEntries(
    behaviorSwitchIds.map((id) => [
      id,
      unique(merged.behaviorSwitches?.[id] ?? []),
    ]),
  ) as Record<BehaviorSwitchId, string[]>;
  return {
    categoryNamespaces: unique(
      merged.categoryNamespaces ?? base.categoryNamespaces,
    ),
    defaultsortMagicWords: unique(
      merged.defaultsortMagicWords ?? base.defaultsortMagicWords,
    ),
    behaviorSwitches,
  };
}

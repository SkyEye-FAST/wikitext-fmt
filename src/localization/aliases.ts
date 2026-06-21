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
  fileNamespaces: string[];
  defaultsortMagicWords: string[];
  redirectMagicWords: string[];
  imageOptionAliases: Record<string, string[]>;
  behaviorSwitches: Record<BehaviorSwitchId, string[]>;
}

type LocalizationBase = "builtin" | "canonical";

const behaviorIdSet = new Set<string>(behaviorSwitchIds);

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function canonicalAliases(): ResolvedLocalizationAliases {
  return {
    categoryNamespaces: ["Category"],
    fileNamespaces: ["File", "Image"],
    defaultsortMagicWords: ["DEFAULTSORT:", "DEFAULTSORTKEY:"],
    redirectMagicWords: ["#REDIRECT"],
    imageOptionAliases: {
      img_thumbnail: ["thumb", "thumbnail"],
      img_manualthumb: ["thumbnail"],
      img_framed: ["frame", "framed", "enframed"],
      img_frameless: ["frameless"],
      img_border: ["border"],
      img_left: ["left"],
      img_right: ["right"],
      img_center: ["center", "centre"],
      img_none: ["none"],
      img_width: ["$1px"],
      img_alt: ["alt=$1"],
      img_link: ["link=$1"],
      img_page: ["page=$1", "page $1"],
      img_upright: ["upright", "upright=$1", "upright $1"],
      img_class: ["class=$1"],
      img_lang: ["lang=$1"],
    },
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
    if (source.fileNamespaces) {
      result.fileNamespaces = unique([
        ...(result.fileNamespaces ?? []),
        ...source.fileNamespaces,
      ]);
    }
    if (source.defaultsortMagicWords) {
      result.defaultsortMagicWords = unique([
        ...(result.defaultsortMagicWords ?? []),
        ...source.defaultsortMagicWords,
      ]);
    }
    if (source.redirectMagicWords) {
      result.redirectMagicWords = unique([
        ...(result.redirectMagicWords ?? []),
        ...source.redirectMagicWords,
      ]);
    }
    if (source.imageOptionAliases) {
      result.imageOptionAliases ??= {};
      for (const [id, aliases] of Object.entries(source.imageOptionAliases)) {
        result.imageOptionAliases[id] = unique([
          ...(result.imageOptionAliases[id] ?? []),
          ...aliases,
        ]);
      }
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
    fileNamespaces: override?.fileNamespaces,
    defaultsortMagicWords: override?.defaultsortMagicWords,
    redirectMagicWords: override?.redirectMagicWords,
    imageOptionAliases: override?.imageOptionAliases,
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
    (customAliases.fileNamespaces?.length ?? 0) > 0 ||
    (customAliases.defaultsortMagicWords?.length ?? 0) > 0 ||
    (customAliases.redirectMagicWords?.length ?? 0) > 0 ||
    Object.values(customAliases.imageOptionAliases ?? {}).some(
      (aliases) => aliases.length > 0,
    ) ||
    Object.values(customAliases.behaviorSwitches ?? {}).some(
      (aliases) => aliases.length > 0,
    );
  if (source === "siteinfo" && !hasAliasData) {
    throw new Error(
      "Siteinfo localization aliases were not loaded; use the CLI with --site-api",
    );
  }
  const localizationBase: LocalizationBase =
    source === "builtin" ? "builtin" : "canonical";
  const base = canonicalAliases();
  const selected =
    localizationBase === "builtin"
      ? overrideLocalizationAliases(
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
  const imageOptionAliases = Object.fromEntries(
    Object.entries(merged.imageOptionAliases ?? {}).map(([id, aliases]) => [
      id,
      unique(aliases),
    ]),
  );
  return {
    categoryNamespaces: unique(
      merged.categoryNamespaces ?? base.categoryNamespaces,
    ),
    fileNamespaces: unique(merged.fileNamespaces ?? base.fileNamespaces),
    defaultsortMagicWords: unique(
      merged.defaultsortMagicWords ?? base.defaultsortMagicWords,
    ),
    redirectMagicWords: unique(
      merged.redirectMagicWords ?? base.redirectMagicWords,
    ),
    imageOptionAliases,
    behaviorSwitches,
  };
}

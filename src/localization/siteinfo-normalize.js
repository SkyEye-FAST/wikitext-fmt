const imageOptionIds = new Set([
  "img_thumbnail",
  "img_manualthumb",
  "img_framed",
  "img_frameless",
  "img_border",
  "img_left",
  "img_right",
  "img_center",
  "img_none",
  "img_width",
  "img_alt",
  "img_link",
  "img_page",
  "img_upright",
  "img_class",
  "img_lang",
]);

const behaviorSwitchIds = new Set([
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
]);

function strings(values) {
  return values.filter(
    (value) => typeof value === "string" && value.length > 0,
  );
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Convert a raw action=query&meta=siteinfo response into the exact alias shape
 * consumed by FormatOptions.localizationAliases.
 *
 * @param {unknown} payload
 * @param {string} [source]
 * @returns {{
 *   categoryNamespaces: string[];
 *   fileNamespaces: string[];
 *   defaultsortMagicWords: string[];
 *   redirectMagicWords: string[];
 *   imageOptionAliases: Record<string, string[]>;
 *   behaviorSwitches: Record<string, string[]>;
 * }}
 */
export function normalizeSiteInfoPayload(
  payload,
  source = "MediaWiki siteinfo",
) {
  if (!isRecord(payload)) {
    throw new Error(`${source} response must be a JSON object`);
  }
  if (payload.error) {
    throw new Error(`${source} returned an API error`);
  }
  const query = payload.query;
  if (!isRecord(query)) {
    throw new Error(`${source} response did not contain query data`);
  }

  const namespaces = query.namespaces;
  const namespaceValues = Array.isArray(namespaces)
    ? namespaces
    : isRecord(namespaces)
      ? Object.values(namespaces)
      : [];
  const categoryNamespaces = [];
  const fileNamespaces = [];
  for (const namespace of namespaceValues) {
    if (!isRecord(namespace)) continue;
    const names = strings([
      namespace["*"],
      namespace.name,
      namespace.canonical,
    ]);
    if (namespace.id === 14) categoryNamespaces.push(...names);
    if (namespace.id === 6) fileNamespaces.push(...names);
  }
  const namespaceAliases = Array.isArray(query.namespacealiases)
    ? query.namespacealiases
    : [];
  for (const alias of namespaceAliases) {
    if (!isRecord(alias)) continue;
    const names = strings([alias["*"], alias.name]);
    if (alias.id === 14) categoryNamespaces.push(...names);
    if (alias.id === 6) fileNamespaces.push(...names);
  }

  const doubleUnderscores = Array.isArray(query.doubleunderscores)
    ? query.doubleunderscores
    : [];
  const doubleUnderscoreIds = new Set(
    doubleUnderscores
      .map((entry) =>
        typeof entry === "string"
          ? entry
          : isRecord(entry) && typeof entry.name === "string"
            ? entry.name
            : "",
      )
      .map((name) => name.replace(/^__|__$/gu, "").toLowerCase()),
  );
  const imageOptionAliases = {};
  const behaviorSwitches = {};
  let defaultsortMagicWords = [];
  let redirectMagicWords = [];
  const magicwords = Array.isArray(query.magicwords) ? query.magicwords : [];
  for (const magicWord of magicwords) {
    if (!isRecord(magicWord) || !Array.isArray(magicWord.aliases)) continue;
    const name =
      typeof magicWord.name === "string" ? magicWord.name.toLowerCase() : "";
    const aliases = strings(magicWord.aliases);
    if (!name) continue;
    if (name === "defaultsort") defaultsortMagicWords = aliases;
    if (name === "redirect") redirectMagicWords = aliases;
    if (imageOptionIds.has(name)) imageOptionAliases[name] = aliases;
    if (
      behaviorSwitchIds.has(name) &&
      (doubleUnderscoreIds.size === 0 || doubleUnderscoreIds.has(name))
    ) {
      behaviorSwitches[name] = aliases;
    }
  }

  if (categoryNamespaces.length === 0) {
    throw new Error(`${source} response did not include namespace ID 14`);
  }
  return {
    categoryNamespaces: [...new Set(categoryNamespaces)],
    fileNamespaces: [...new Set(fileNamespaces)],
    defaultsortMagicWords: [...new Set(defaultsortMagicWords)],
    redirectMagicWords: [...new Set(redirectMagicWords)],
    imageOptionAliases,
    behaviorSwitches,
  };
}

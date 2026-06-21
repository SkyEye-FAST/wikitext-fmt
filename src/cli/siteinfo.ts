import { behaviorSwitchIds } from "../localization/aliases.js";
import type { LocalizationAliases } from "../options.js";

interface SiteInfoNamespace {
  id?: number;
  canonical?: string;
  "*"?: string;
  name?: string;
}

interface SiteInfoMagicWord {
  name?: string;
  aliases?: string[];
}

export async function loadSiteInfoAliases(
  apiUrl: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<LocalizationAliases> {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(`Invalid MediaWiki site API URL: ${apiUrl}`);
  }
  url.searchParams.set("action", "query");
  url.searchParams.set("meta", "siteinfo");
  url.searchParams.set("siprop", "namespaces|namespacealiases|magicwords|doubleunderscores");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  let response: Response;
  try {
    response = await fetchImplementation(url);
  } catch (error) {
    throw new Error(`Could not fetch MediaWiki siteinfo from ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Could not fetch MediaWiki siteinfo from ${apiUrl}: HTTP ${response.status}`);
  }
  const payload = await response.json() as Record<string, unknown>;
  if (payload.error) throw new Error(`MediaWiki siteinfo returned an API error for ${apiUrl}`);
  const query = payload.query as Record<string, unknown> | undefined;
  if (!query) throw new Error(`MediaWiki siteinfo response from ${apiUrl} did not contain query data`);

  const namespaces = query.namespaces as Record<string, SiteInfoNamespace> | SiteInfoNamespace[] | undefined;
  const namespaceValues = Array.isArray(namespaces) ? namespaces : Object.values(namespaces ?? {});
  const categoryNamespaces = namespaceValues
    .filter((namespace) => namespace.id === 14)
    .flatMap((namespace) => [namespace["*"], namespace.name, namespace.canonical])
    .filter((value): value is string => Boolean(value));
  const namespaceAliases = (query.namespacealiases as SiteInfoNamespace[] | undefined) ?? [];
  for (const alias of namespaceAliases) {
    if (alias.id === 14) categoryNamespaces.push(...[alias["*"], alias.name].filter((v): v is string => Boolean(v)));
  }

  const doubleUnderscores = (query.doubleunderscores as Array<string | { name?: string }> | undefined) ?? [];
  const doubleUnderscoreIds = new Set(
    doubleUnderscores.map((entry) => (typeof entry === "string" ? entry : entry.name) ?? "")
      .map((name) => name.replace(/^__|__$/gu, "").toLowerCase()),
  );
  const behaviorIdSet = new Set<string>(behaviorSwitchIds);
  const behaviorSwitches: Record<string, string[]> = {};
  let defaultsortMagicWords: string[] = [];
  for (const magicWord of (query.magicwords as SiteInfoMagicWord[] | undefined) ?? []) {
    const name = magicWord.name?.toLowerCase();
    if (!name || !Array.isArray(magicWord.aliases)) continue;
    if (name === "defaultsort") defaultsortMagicWords = magicWord.aliases;
    if (behaviorIdSet.has(name) && (doubleUnderscoreIds.size === 0 || doubleUnderscoreIds.has(name))) {
      behaviorSwitches[name] = magicWord.aliases;
    }
  }

  if (categoryNamespaces.length === 0) {
    throw new Error(`MediaWiki siteinfo response from ${apiUrl} did not include namespace ID 14`);
  }
  return { categoryNamespaces, defaultsortMagicWords, behaviorSwitches };
}

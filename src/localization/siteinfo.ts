import type { LocalizationAliases } from "../options.js";
import { normalizeSiteInfoPayload } from "./siteinfo-normalize.js";

export { normalizeSiteInfoPayload } from "./siteinfo-normalize.js";

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
  url.searchParams.set(
    "siprop",
    "namespaces|namespacealiases|magicwords|doubleunderscores",
  );
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  let response: Response;
  try {
    response = await fetchImplementation(url);
  } catch (error) {
    throw new Error(
      `Could not fetch MediaWiki siteinfo from ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Could not fetch MediaWiki siteinfo from ${apiUrl}: HTTP ${response.status}`,
    );
  }
  return normalizeSiteInfoPayload(
    await response.json(),
    `MediaWiki siteinfo response from ${apiUrl}`,
  ) as LocalizationAliases;
}

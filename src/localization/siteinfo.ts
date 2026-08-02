import type { LocalizationAliases } from "../options.js";
import {
  normalizeSiteInfoFormattingPayload,
  normalizeSiteInfoPayload,
} from "./siteinfo-normalize.js";

export {
  normalizeSiteInfoFormattingPayload,
  normalizeSiteInfoPayload,
} from "./siteinfo-normalize.js";

export interface SiteInfoFormattingData {
  localizationAliases: LocalizationAliases;
  interlanguagePrefixes: string[];
}

export async function loadSiteInfoFormattingData(
  apiUrl: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<SiteInfoFormattingData> {
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
    "namespaces|namespacealiases|magicwords|doubleunderscores|interwikimap",
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
  return normalizeSiteInfoFormattingPayload(
    await response.json(),
    `MediaWiki siteinfo response from ${apiUrl}`,
  ) as SiteInfoFormattingData;
}

export async function loadSiteInfoAliases(
  apiUrl: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<LocalizationAliases> {
  return (
    await loadSiteInfoFormattingData(apiUrl, fetchImplementation)
  ).localizationAliases;
}

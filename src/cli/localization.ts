import { resolveLocalizationAliases } from "../localization/aliases.js";
import {
  loadSiteInfoFormattingData,
  type SiteInfoFormattingData,
} from "../localization/siteinfo.js";
import type { FormatOptions } from "../options.js";
import { applySiteFormattingData } from "../projectConfig.js";
import type { CliOptions } from "./args.js";

export async function prepareLocalizationOptions(
  options: CliOptions,
  formatOptions: FormatOptions,
  loadSiteData: (apiUrl: string) => Promise<SiteInfoFormattingData> =
    loadSiteInfoFormattingData,
): Promise<FormatOptions> {
  if (formatOptions.localizationSource !== "siteinfo") return formatOptions;
  if (!options.siteApi) {
    throw new Error(
      "--site-api is required when --localization-source is siteinfo",
    );
  }
  const siteData = await loadSiteData(options.siteApi);
  return applySiteFormattingData(formatOptions, siteData);
}

export function resolvedLocalizationAliasesJson(
  formatOptions: FormatOptions,
): string {
  return `${JSON.stringify(
    resolveLocalizationAliases(
      formatOptions.localizationSource ?? "builtin",
      formatOptions.localizationAliases ?? {},
    ),
    null,
    2,
  )}\n`;
}

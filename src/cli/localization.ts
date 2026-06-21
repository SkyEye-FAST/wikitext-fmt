import type { FormatOptions } from "../options.js";
import {
  overrideLocalizationAliases,
  resolveLocalizationAliases,
} from "../localization/aliases.js";
import { loadSiteInfoAliases } from "../localization/siteinfo.js";
import type { CliOptions } from "./args.js";

export async function prepareLocalizationOptions(
  options: CliOptions,
  formatOptions: FormatOptions,
): Promise<FormatOptions> {
  if (formatOptions.localizationSource !== "siteinfo") return formatOptions;
  if (!options.siteApi) {
    throw new Error(
      "--site-api is required when --localization-source is siteinfo",
    );
  }
  const siteAliases = await loadSiteInfoAliases(options.siteApi);
  return {
    ...formatOptions,
    localizationSource: "custom",
    localizationAliases: overrideLocalizationAliases(
      siteAliases,
      formatOptions.localizationAliases,
    ),
  };
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

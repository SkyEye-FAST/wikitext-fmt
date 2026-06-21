import type { FormatOptions } from "./options.js";
import { resolveOptions } from "./options.js";
import { getParserConfig, isRoundTripSafe, parseWikitext } from "./parser.js";
import { normalizeBlankLines } from "./rules/blankLines.js";
import {
  formatPageFooter,
  type FooterDiagnostics,
} from "./rules/categories.js";
import { formatHeadings } from "./rules/headings.js";
import { formatTemplates } from "./rules/templates.js";
import { isRuleEnabled } from "./rules/index.js";
import { formatHtmlVoidTags } from "./rules/htmlVoidTags.js";
import { formatLists } from "./rules/lists.js";
import {
  formatFileLinks,
  type FileLinkDiagnostics,
} from "./rules/fileLinks.js";
import {
  formatRedirects,
  type RedirectDiagnostics,
} from "./rules/redirects.js";
import {
  formatSectionSpacing,
  type SectionSpacingDiagnostics,
} from "./rules/sectionSpacing.js";
import {
  formatTemplateParameters,
  type TemplateParameterDiagnostics,
} from "./rules/templateParameters.js";
import {
  formatTablesWithDiagnostics,
  lineNumberAt,
  type TableDiagnostic,
} from "./rules/tables.js";
import { protectBlocks } from "./utils/protectBlocks.js";

export interface FormatResult {
  formatted: string;
  warning?: string;
}

export interface FormatDetailedResult extends FormatResult {
  tableDiagnostics: TableDiagnostic[];
  footerDiagnostics: FooterDiagnostics;
  redirectDiagnostics: RedirectDiagnostics;
  fileLinkDiagnostics: FileLinkDiagnostics;
  sectionSpacingDiagnostics: SectionSpacingDiagnostics;
  templateParameterDiagnostics: TemplateParameterDiagnostics;
}

const emptyFooterDiagnostics = (): FooterDiagnostics => ({
  behaviorSwitchesMoved: 0,
  behaviorSwitchesFormatted: 0,
  defaultsortMoved: 0,
  categoriesMoved: 0,
  localizedCategoryAliasesCanonicalized: 0,
  localizedDefaultsortAliasesCanonicalized: 0,
  localizedBehaviorSwitchesCanonicalized: 0,
  interlanguageLinksMoved: 0,
  interlanguageLinksFormatted: 0,
});

const emptyRedirectDiagnostics = (): RedirectDiagnostics => ({
  redirectsFormatted: 0,
  localizedRedirectAliasesCanonicalized: 0,
});

const emptyFileLinkDiagnostics = (): FileLinkDiagnostics => ({
  fileLinksFormatted: 0,
  localizedFileNamespaceAliasesCanonicalized: 0,
  localizedImageOptionsCanonicalized: 0,
});

const emptySectionSpacingDiagnostics = (): SectionSpacingDiagnostics => ({
  sectionSpacingBeforeHeadingsInserted: 0,
  sectionSpacingAfterHeadingsInserted: 0,
});

const emptyTemplateParameterDiagnostics = (): TemplateParameterDiagnostics => ({
  templateParametersFormatted: 0,
  templateParameterLinesFormatted: 0,
  templateParameterLinesSkippedUnsafe: 0,
});

export function formatWikitextDetailedResult(
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  const resolved = resolveOptions(options);
  let tableDiagnostics: TableDiagnostic[] = [];
  let footerDiagnostics = emptyFooterDiagnostics();
  let redirectDiagnostics = emptyRedirectDiagnostics();
  let fileLinkDiagnostics = emptyFileLinkDiagnostics();
  let sectionSpacingDiagnostics = emptySectionSpacingDiagnostics();
  let templateParameterDiagnostics = emptyTemplateParameterDiagnostics();
  try {
    const config = getParserConfig(resolved.parserConfig);
    if (!isRoundTripSafe(source, config)) {
      return {
        formatted: source,
        warning:
          "The parser could not round-trip the input exactly; left it unchanged.",
        tableDiagnostics,
        footerDiagnostics,
        redirectDiagnostics,
        fileLinkDiagnostics,
        sectionSpacingDiagnostics,
        templateParameterDiagnostics,
      };
    }

    // Parse once before transformations so malformed input fails closed.
    parseWikitext(source, config);
    let tableOutput = source;
    if (resolved.formatTables && isRuleEnabled("tables", resolved.level)) {
      const tableBlocks = protectBlocks(tableOutput, {
        protectTables: false,
        protectComments: false,
      });
      const tableResult = formatTablesWithDiagnostics(
        tableBlocks.text,
        config,
        resolved,
      );
      tableOutput = tableResult.formatted;
      tableDiagnostics = tableResult.diagnostics.map((diagnostic) => {
        const start = tableBlocks.originalIndex(diagnostic.start);
        const line = lineNumberAt(source, start);
        return {
          ...diagnostic,
          start,
          end: tableBlocks.originalIndex(diagnostic.end),
          line,
          ...(diagnostic.lineDiagnostics
            ? {
                lineDiagnostics: diagnostic.lineDiagnostics.map(
                  (lineDiagnostic) => ({
                    ...lineDiagnostic,
                    sourceLine: line + lineDiagnostic.tableLine - 1,
                  }),
                ),
              }
            : {}),
        };
      });
      tableOutput = tableBlocks.restore(tableOutput);
    }

    // Re-protect tables before running non-table rules so enabling the
    // experimental table pass cannot make stable rules more aggressive.
    const protectedText = protectBlocks(tableOutput, { protectTables: true });
    let output = protectedText.text;
    if (
      resolved.formatTemplates &&
      isRuleEnabled("templates", resolved.level) &&
      !(
        resolved.formatTemplateParameters &&
        isRuleEnabled("templateParameters", resolved.level)
      )
    ) {
      output = formatTemplates(output, config, resolved.lineWidth);
    }
    if (
      resolved.formatTemplateParameters &&
      isRuleEnabled("templateParameters", resolved.level)
    ) {
      const templateParameters = formatTemplateParameters(output);
      output = templateParameters.formatted;
      templateParameterDiagnostics = templateParameters.diagnostics;
    }
    if (resolved.formatHeadings && isRuleEnabled("headings", resolved.level))
      output = formatHeadings(output);
    if (
      resolved.formatRedirects &&
      isRuleEnabled("redirects", resolved.level)
    ) {
      const redirect = formatRedirects(output, {
        localizationSource: resolved.localizationSource,
        localizedSyntaxStyle: resolved.localizedSyntaxStyle,
        localizationAliases: resolved.localizationAliases,
      });
      output = redirect.formatted;
      redirectDiagnostics = redirect.diagnostics;
    }
    if (
      resolved.formatFileLinks &&
      isRuleEnabled("fileLinks", resolved.level)
    ) {
      const fileLinks = formatFileLinks(output, {
        localizationSource: resolved.localizationSource,
        localizedSyntaxStyle: resolved.localizedSyntaxStyle,
        localizationAliases: resolved.localizationAliases,
      });
      output = fileLinks.formatted;
      fileLinkDiagnostics = fileLinks.diagnostics;
    }
    if (resolved.formatLists && isRuleEnabled("lists", resolved.level))
      output = formatLists(output);
    if (
      resolved.formatSectionSpacing &&
      isRuleEnabled("sectionSpacing", resolved.level)
    ) {
      const sectionSpacing = formatSectionSpacing(output);
      output = sectionSpacing.formatted;
      sectionSpacingDiagnostics = sectionSpacing.diagnostics;
    }
    if (
      resolved.normalizeBlankLines &&
      isRuleEnabled("blankLines", resolved.level)
    ) {
      output = normalizeBlankLines(output);
    }
    if (isRuleEnabled("htmlVoidTags", resolved.level)) {
      output = formatHtmlVoidTags(output, resolved.htmlVoidTagStyle);
    }
    const categoriesEnabled =
      resolved.formatCategories && isRuleEnabled("categories", resolved.level);
    const behaviorSwitchesEnabled =
      resolved.formatBehaviorSwitches &&
      isRuleEnabled("behaviorSwitches", resolved.level);
    const interlanguageLinksEnabled =
      resolved.formatInterlanguageLinks &&
      isRuleEnabled("interlanguageLinks", resolved.level);
    if (
      categoriesEnabled ||
      behaviorSwitchesEnabled ||
      interlanguageLinksEnabled
    ) {
      const footer = formatPageFooter(output, config, {
        formatCategories: categoriesEnabled,
        formatBehaviorSwitches: behaviorSwitchesEnabled,
        formatInterlanguageLinks: interlanguageLinksEnabled,
        interlanguagePlacement: resolved.interlanguagePlacement,
        interlanguagePrefixes: resolved.interlanguagePrefixes,
        behaviorSwitchPlacement: resolved.behaviorSwitchPlacement,
        localizationSource: resolved.localizationSource,
        localizedSyntaxStyle: resolved.localizedSyntaxStyle,
        localizationAliases: resolved.localizationAliases,
      });
      output = footer.formatted;
      footerDiagnostics = footer.diagnostics;
    }
    output = protectedText.restore(output);

    if (!isRoundTripSafe(output, config)) {
      return {
        formatted: source,
        warning:
          "The formatted output did not parse safely; left the input unchanged.",
        tableDiagnostics,
        footerDiagnostics,
        redirectDiagnostics,
        fileLinkDiagnostics,
        sectionSpacingDiagnostics,
        templateParameterDiagnostics,
      };
    }
    return {
      formatted: output,
      tableDiagnostics,
      footerDiagnostics,
      redirectDiagnostics,
      fileLinkDiagnostics,
      sectionSpacingDiagnostics,
      templateParameterDiagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      formatted: source,
      warning: `Formatting failed safely: ${message}`,
      tableDiagnostics,
      footerDiagnostics,
      redirectDiagnostics,
      fileLinkDiagnostics,
      sectionSpacingDiagnostics,
      templateParameterDiagnostics,
    };
  }
}

export function formatWikitextResult(
  source: string,
  options: FormatOptions = {},
): FormatResult {
  const {
    tableDiagnostics: _tableDiagnostics,
    footerDiagnostics: _footerDiagnostics,
    redirectDiagnostics: _redirectDiagnostics,
    fileLinkDiagnostics: _fileLinkDiagnostics,
    sectionSpacingDiagnostics: _sectionSpacingDiagnostics,
    templateParameterDiagnostics: _templateParameterDiagnostics,
    ...result
  } = formatWikitextDetailedResult(source, options);
  return result;
}

export function formatWikitext(
  source: string,
  options: FormatOptions = {},
): string {
  return formatWikitextResult(source, options).formatted;
}

export function formatWikitextSafe(
  source: string,
  options: FormatOptions = {},
): FormatResult {
  const {
    tableDiagnostics: _tableDiagnostics,
    footerDiagnostics: _footerDiagnostics,
    redirectDiagnostics: _redirectDiagnostics,
    fileLinkDiagnostics: _fileLinkDiagnostics,
    sectionSpacingDiagnostics: _sectionSpacingDiagnostics,
    templateParameterDiagnostics: _templateParameterDiagnostics,
    ...result
  } = formatWikitextSafeDetailed(source, options);
  return result;
}

export function formatWikitextSafeDetailed(
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  let tableDiagnostics: TableDiagnostic[] = [];
  let footerDiagnostics = emptyFooterDiagnostics();
  let redirectDiagnostics = emptyRedirectDiagnostics();
  let fileLinkDiagnostics = emptyFileLinkDiagnostics();
  let sectionSpacingDiagnostics = emptySectionSpacingDiagnostics();
  let templateParameterDiagnostics = emptyTemplateParameterDiagnostics();
  try {
    const resolved = resolveOptions(options);
    const config = getParserConfig(resolved.parserConfig);
    parseWikitext(source, config);

    const first = formatWikitextDetailedResult(source, options);
    tableDiagnostics = first.tableDiagnostics;
    footerDiagnostics = first.footerDiagnostics;
    redirectDiagnostics = first.redirectDiagnostics;
    fileLinkDiagnostics = first.fileLinkDiagnostics;
    sectionSpacingDiagnostics = first.sectionSpacingDiagnostics;
    templateParameterDiagnostics = first.templateParameterDiagnostics;
    if (first.warning)
      return {
        formatted: source,
        warning: first.warning,
        tableDiagnostics,
        footerDiagnostics,
        redirectDiagnostics,
        fileLinkDiagnostics,
        sectionSpacingDiagnostics,
        templateParameterDiagnostics,
      };
    parseWikitext(first.formatted, config);

    const second = formatWikitextDetailedResult(first.formatted, options);
    if (second.warning) {
      return {
        formatted: source,
        warning: `Safe formatting verification failed: ${second.warning}`,
        tableDiagnostics,
        footerDiagnostics,
        redirectDiagnostics,
        fileLinkDiagnostics,
        sectionSpacingDiagnostics,
        templateParameterDiagnostics,
      };
    }
    parseWikitext(second.formatted, config);
    if (second.formatted !== first.formatted) {
      return {
        formatted: source,
        warning:
          "Safe formatting verification failed: output is not idempotent.",
        tableDiagnostics,
        footerDiagnostics,
        redirectDiagnostics,
        fileLinkDiagnostics,
        sectionSpacingDiagnostics,
        templateParameterDiagnostics,
      };
    }
    return first;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      formatted: source,
      warning: `Safe formatting failed: ${message}`,
      tableDiagnostics,
      footerDiagnostics,
      redirectDiagnostics,
      fileLinkDiagnostics,
      sectionSpacingDiagnostics,
      templateParameterDiagnostics,
    };
  }
}

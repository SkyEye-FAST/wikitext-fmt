import type { FormatOptions } from "./options.js";
import { resolveOptions } from "./options.js";
import {
  emptyDetailedDiagnostics,
  fallbackDetailedResult,
  stripDiagnostics,
  type DetailedDiagnostics,
} from "./diagnostics.js";
import { getParserConfig, isRoundTripSafe, parseWikitext } from "./parser.js";
import {
  createParserContext,
  type ParsedDocumentContext,
} from "./parserContext.js";
import { normalizeBlankLines } from "./rules/blankLines.js";
import { formatPageFooter } from "./rules/categories.js";
import { formatHeadings } from "./rules/headings.js";
import { formatTemplates } from "./rules/templates.js";
import { isRuleEnabled } from "./rules/index.js";
import { formatHtmlVoidTags } from "./rules/htmlVoidTags.js";
import { formatLists } from "./rules/lists.js";
import { formatFileLinks } from "./rules/fileLinks.js";
import { formatExternalLinks } from "./rules/externalLinks.js";
import { formatReferences } from "./rules/references.js";
import { formatRedirects } from "./rules/redirects.js";
import { formatSectionSpacing } from "./rules/sectionSpacing.js";
import { formatTemplateParameters } from "./rules/templateParameters.js";
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
  tableDiagnostics: DetailedDiagnostics["tableDiagnostics"];
  footerDiagnostics: DetailedDiagnostics["footerDiagnostics"];
  redirectDiagnostics: DetailedDiagnostics["redirectDiagnostics"];
  fileLinkDiagnostics: DetailedDiagnostics["fileLinkDiagnostics"];
  externalLinkDiagnostics: DetailedDiagnostics["externalLinkDiagnostics"];
  referenceDiagnostics: DetailedDiagnostics["referenceDiagnostics"];
  sectionSpacingDiagnostics: DetailedDiagnostics["sectionSpacingDiagnostics"];
  templateParameterDiagnostics: DetailedDiagnostics["templateParameterDiagnostics"];
}

export function formatWikitextDetailedResult(
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  const resolved = resolveOptions(options);
  const diagnostics = emptyDetailedDiagnostics();
  try {
    const config = getParserConfig(resolved.parserConfig);
    if (!isRoundTripSafe(source, config)) {
      return fallbackDetailedResult(
        source,
        "The parser could not round-trip the input exactly; left it unchanged.",
        diagnostics,
      );
    }

    // Parse once before transformations so malformed input fails closed.
    parseWikitext(source, config);
    let contextSource: string | undefined;
    let context: ParsedDocumentContext | undefined;
    const contextFor = (snapshot: string): ParsedDocumentContext => {
      if (!context || contextSource !== snapshot) {
        context = createParserContext(snapshot, config);
        contextSource = snapshot;
      }
      return context;
    };
    const invalidateContext = (): void => {
      context = undefined;
      contextSource = undefined;
    };

    let tableOutput = source;
    if (resolved.formatTables && isRuleEnabled("tables", resolved.level)) {
      const tableBlocks = protectBlocks(tableOutput, {
        protectTables: false,
        protectComments: false,
      });
      const tableContext = createParserContext(tableBlocks.text, config);
      const tableResult = formatTablesWithDiagnostics(
        tableBlocks.text,
        config,
        resolved,
        tableContext,
      );
      tableOutput = tableResult.formatted;
      diagnostics.tableDiagnostics = tableResult.diagnostics.map(
        (diagnostic) => {
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
        },
      );
      tableOutput = tableBlocks.restore(tableOutput);
    }

    if (
      resolved.formatReferences &&
      isRuleEnabled("references", resolved.level)
    ) {
      const referenceBlocks = protectBlocks(tableOutput, {
        protectTables: true,
        protectReferenceTags: false,
      });
      const referenceContext = contextFor(referenceBlocks.text);
      const references = formatReferences(
        referenceBlocks.text,
        referenceContext,
      );
      const nextTableOutput = referenceBlocks.restore(references.formatted);
      if (nextTableOutput !== tableOutput) invalidateContext();
      tableOutput = nextTableOutput;
      diagnostics.referenceDiagnostics = references.diagnostics;
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
      const templateContext = contextFor(output);
      const previous = output;
      output = formatTemplates(
        output,
        config,
        resolved.lineWidth,
        templateContext,
      );
      if (output !== previous) invalidateContext();
    }
    if (
      resolved.formatTemplateParameters &&
      isRuleEnabled("templateParameters", resolved.level)
    ) {
      const previous = output;
      const templateParameters = formatTemplateParameters(output);
      output = templateParameters.formatted;
      diagnostics.templateParameterDiagnostics = templateParameters.diagnostics;
      if (output !== previous) invalidateContext();
    }
    if (resolved.formatHeadings && isRuleEnabled("headings", resolved.level)) {
      const previous = output;
      output = formatHeadings(output);
      if (output !== previous) invalidateContext();
    }
    if (
      resolved.formatRedirects &&
      isRuleEnabled("redirects", resolved.level)
    ) {
      const previous = output;
      const redirect = formatRedirects(output, {
        localizationSource: resolved.localizationSource,
        localizedSyntaxStyle: resolved.localizedSyntaxStyle,
        localizationAliases: resolved.localizationAliases,
      });
      output = redirect.formatted;
      diagnostics.redirectDiagnostics = redirect.diagnostics;
      if (output !== previous) invalidateContext();
    }
    if (
      resolved.formatFileLinks &&
      isRuleEnabled("fileLinks", resolved.level)
    ) {
      const fileLinkContext = contextFor(output);
      const previous = output;
      const fileLinks = formatFileLinks(
        output,
        {
          localizationSource: resolved.localizationSource,
          localizedSyntaxStyle: resolved.localizedSyntaxStyle,
          localizationAliases: resolved.localizationAliases,
        },
        fileLinkContext,
      );
      output = fileLinks.formatted;
      diagnostics.fileLinkDiagnostics = fileLinks.diagnostics;
      if (output !== previous) invalidateContext();
    }
    if (
      resolved.formatExternalLinks &&
      isRuleEnabled("externalLinks", resolved.level)
    ) {
      const externalLinkContext = contextFor(output);
      const previous = output;
      const externalLinks = formatExternalLinks(output, externalLinkContext);
      output = externalLinks.formatted;
      diagnostics.externalLinkDiagnostics = externalLinks.diagnostics;
      if (output !== previous) invalidateContext();
    }
    if (resolved.formatLists && isRuleEnabled("lists", resolved.level)) {
      const previous = output;
      output = formatLists(output);
      if (output !== previous) invalidateContext();
    }
    if (
      resolved.formatSectionSpacing &&
      isRuleEnabled("sectionSpacing", resolved.level)
    ) {
      const sectionSpacingContext = contextFor(output);
      const previous = output;
      const sectionSpacing = formatSectionSpacing(
        output,
        sectionSpacingContext,
      );
      output = sectionSpacing.formatted;
      diagnostics.sectionSpacingDiagnostics = sectionSpacing.diagnostics;
      if (output !== previous) invalidateContext();
    }
    if (
      resolved.normalizeBlankLines &&
      isRuleEnabled("blankLines", resolved.level)
    ) {
      const previous = output;
      output = normalizeBlankLines(output);
      if (output !== previous) invalidateContext();
    }
    if (isRuleEnabled("htmlVoidTags", resolved.level)) {
      const previous = output;
      output = formatHtmlVoidTags(output, resolved.htmlVoidTagStyle);
      if (output !== previous) invalidateContext();
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
      const footerContext = contextFor(output);
      const footer = formatPageFooter(
        output,
        config,
        {
          formatCategories: categoriesEnabled,
          formatBehaviorSwitches: behaviorSwitchesEnabled,
          formatInterlanguageLinks: interlanguageLinksEnabled,
          interlanguagePlacement: resolved.interlanguagePlacement,
          interlanguagePrefixes: resolved.interlanguagePrefixes,
          behaviorSwitchPlacement: resolved.behaviorSwitchPlacement,
          localizationSource: resolved.localizationSource,
          localizedSyntaxStyle: resolved.localizedSyntaxStyle,
          localizationAliases: resolved.localizationAliases,
        },
        footerContext,
      );
      output = footer.formatted;
      diagnostics.footerDiagnostics = footer.diagnostics;
      if (output !== footerContext.source) invalidateContext();
    }
    output = protectedText.restore(output);

    if (!isRoundTripSafe(output, config)) {
      return fallbackDetailedResult(
        source,
        "The formatted output did not parse safely; left the input unchanged.",
        diagnostics,
      );
    }
    return {
      formatted: output,
      ...diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallbackDetailedResult(
      source,
      `Formatting failed safely: ${message}`,
      diagnostics,
    );
  }
}

export function formatWikitextResult(
  source: string,
  options: FormatOptions = {},
): FormatResult {
  return stripDiagnostics(formatWikitextDetailedResult(source, options));
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
  return stripDiagnostics(formatWikitextSafeDetailed(source, options));
}

export function formatWikitextSafeDetailed(
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  let diagnostics = emptyDetailedDiagnostics();
  try {
    const resolved = resolveOptions(options);
    const config = getParserConfig(resolved.parserConfig);
    parseWikitext(source, config);

    const first = formatWikitextDetailedResult(source, options);
    diagnostics = {
      tableDiagnostics: first.tableDiagnostics,
      footerDiagnostics: first.footerDiagnostics,
      redirectDiagnostics: first.redirectDiagnostics,
      fileLinkDiagnostics: first.fileLinkDiagnostics,
      externalLinkDiagnostics: first.externalLinkDiagnostics,
      referenceDiagnostics: first.referenceDiagnostics,
      sectionSpacingDiagnostics: first.sectionSpacingDiagnostics,
      templateParameterDiagnostics: first.templateParameterDiagnostics,
    };
    if (first.warning)
      return fallbackDetailedResult(source, first.warning, diagnostics);
    parseWikitext(first.formatted, config);

    const second = formatWikitextDetailedResult(first.formatted, options);
    if (second.warning) {
      return fallbackDetailedResult(
        source,
        `Safe formatting verification failed: ${second.warning}`,
        diagnostics,
      );
    }
    parseWikitext(second.formatted, config);
    if (second.formatted !== first.formatted) {
      return fallbackDetailedResult(
        source,
        "Safe formatting verification failed: output is not idempotent.",
        diagnostics,
      );
    }
    return first;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fallbackDetailedResult(
      source,
      `Safe formatting failed: ${message}`,
      diagnostics,
    );
  }
}

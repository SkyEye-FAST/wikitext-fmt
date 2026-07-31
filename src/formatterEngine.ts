import {
  type DetailedDiagnostics,
  emptyDetailedDiagnostics,
  fallbackDetailedResult,
  stripDiagnostics,
} from "./diagnostics.js";
import { verifyStructuralEquivalence } from "./equivalenceEngine.js";
import {
  normalizeSourceLineEndings,
  type SupportedNormalizedSource,
} from "./lineEndings.js";
import type { FormatOptions, ResolvedFormatOptions } from "./options.js";
import { resolveOptions } from "./options.js";
import {
  collectNodes,
  nodeRange,
  type ParsedDocumentContext,
  type ParserNodeLike,
  type SourceRange,
} from "./parserContext.js";
import {
  type ParserRuntime,
  type ParserSession,
  UnsupportedParserConfigError,
} from "./parserRuntime.js";
import { normalizeBlankLines } from "./rules/blankLines.js";
import { formatPageFooter } from "./rules/categories.js";
import { formatExternalLinks } from "./rules/externalLinks.js";
import { formatFileLinks } from "./rules/fileLinks.js";
import { formatHeadings } from "./rules/headings.js";
import { formatHtmlVoidTags } from "./rules/htmlVoidTags.js";
import { isRuleEnabled } from "./rules/index.js";
import { formatListsWithDiagnostics } from "./rules/lists.js";
import { formatRedirects } from "./rules/redirects.js";
import { formatReferences } from "./rules/references.js";
import { formatSectionSpacing } from "./rules/sectionSpacing.js";
import { formatTablesWithDiagnostics, lineNumberAt } from "./rules/tables.js";
import { formatTemplatesWithDiagnostics } from "./rules/templates.js";
import { formatWikilinks } from "./rules/wikilinks.js";
import { protectBlocks } from "./utils/protectBlocks.js";

export interface FormatResult {
  formatted: string;
  failure?: FormatFailure;
  warning?: string;
}

export type FormatFailureCode =
  | "input-parse"
  | "input-roundtrip"
  | "unsupported-parser-config"
  | "unsupported-line-endings"
  | "output-parse"
  | "template-equivalence"
  | "table-equivalence"
  | "document-equivalence"
  | "idempotency"
  | "template-convergence"
  | "table-convergence"
  | "formatter-exception";

export interface FormatFailure {
  code: FormatFailureCode;
  stage?: string;
  message: string;
}

export interface FormatterApi {
  formatWikitext(source: string, options?: FormatOptions): string;
  formatWikitextDetailedResult(
    source: string,
    options?: FormatOptions,
  ): FormatDetailedResult;
  formatWikitextResult(source: string, options?: FormatOptions): FormatResult;
  formatWikitextSafe(source: string, options?: FormatOptions): FormatResult;
  formatWikitextSafeDetailed(
    source: string,
    options?: FormatOptions,
  ): FormatDetailedResult;
}

type ExtensionNode = ParserNodeLike & { name?: string };

function parserExtensionRanges(
  context: ParsedDocumentContext,
  protectReferences = true,
): SourceRange[] {
  return collectNodes(context, "ext")
    .map((node) => node as ExtensionNode)
    .filter(
      (node) =>
        protectReferences || !/^(?:ref|references)$/iu.test(node.name ?? ""),
    )
    .map(nodeRange);
}

export interface FormatDetailedResult extends FormatResult {
  tableDiagnostics: DetailedDiagnostics["tableDiagnostics"];
  tableFormatDiagnostics: DetailedDiagnostics["tableFormatDiagnostics"];
  footerDiagnostics: DetailedDiagnostics["footerDiagnostics"];
  redirectDiagnostics: DetailedDiagnostics["redirectDiagnostics"];
  fileLinkDiagnostics: DetailedDiagnostics["fileLinkDiagnostics"];
  wikilinkDiagnostics: DetailedDiagnostics["wikilinkDiagnostics"];
  externalLinkDiagnostics: DetailedDiagnostics["externalLinkDiagnostics"];
  referenceDiagnostics: DetailedDiagnostics["referenceDiagnostics"];
  listDiagnostics: DetailedDiagnostics["listDiagnostics"];
  sectionSpacingDiagnostics: DetailedDiagnostics["sectionSpacingDiagnostics"];
  templateParameterDiagnostics: DetailedDiagnostics["templateParameterDiagnostics"];
  equivalenceDiagnostics: DetailedDiagnostics["equivalenceDiagnostics"];
}

function formatNormalizedWikitextDetailedResult(
  session: ParserSession,
  source: string,
  resolved: ResolvedFormatOptions,
): FormatDetailedResult {
  const diagnostics = emptyDetailedDiagnostics();
  try {
    let initialContext: ParsedDocumentContext;
    try {
      initialContext = session.createContext(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fallbackDetailedResult(
        source,
        {
          code: "input-parse",
          stage: "initial-parse",
          message: `The input could not be parsed safely: ${message}; left it unchanged.`,
        },
        diagnostics,
      );
    }
    if (initialContext.root.toString() !== source) {
      return fallbackDetailedResult(
        source,
        {
          code: "input-roundtrip",
          stage: "initial-roundtrip",
          message:
            "The parser could not round-trip the input exactly; left it unchanged.",
        },
        diagnostics,
      );
    }

    let contextSource: string | undefined = source;
    let context: ParsedDocumentContext | undefined = initialContext;
    const contextFor = (snapshot: string): ParsedDocumentContext => {
      if (!context || contextSource !== snapshot) {
        context = session.createContext(snapshot);
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
      const beforeTables = tableOutput;
      const tableBlocks = protectBlocks(tableOutput, {
        protectTables: false,
        additionalRanges: parserExtensionRanges(contextFor(tableOutput)),
      });
      const tableContext = contextFor(tableBlocks.text);
      const tableResult = formatTablesWithDiagnostics(
        tableContext,
        resolved,
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
      diagnostics.tableFormatDiagnostics = tableResult.summary;
      if (tableResult.summary.convergenceLimitReached) {
        return fallbackDetailedResult(
          source,
          {
            code: "table-convergence",
            stage: "tables",
            message:
              "Table formatting did not converge within its bounded pass limit; left the input unchanged.",
          },
          diagnostics,
        );
      }
      tableOutput = tableBlocks.restore(tableOutput);
      const equivalence =
        beforeTables === tableOutput
          ? { equivalent: true as const, structure: "tables" as const }
          : verifyStructuralEquivalence(
              beforeTables,
              tableOutput,
              "tables",
              session,
            );
      diagnostics.equivalenceDiagnostics.push(equivalence);
      if (!equivalence.equivalent) {
        return fallbackDetailedResult(
          source,
          {
            code: "table-equivalence",
            stage: "tables",
            message: `Structural equivalence failed for tables: ${equivalence.reason}; left the input unchanged.`,
          },
          diagnostics,
        );
      }
    }

    if (
      resolved.formatReferences &&
      isRuleEnabled("references", resolved.level)
    ) {
      const referenceBlocks = protectBlocks(tableOutput, {
        protectTables: true,
        protectReferenceTags: false,
        additionalRanges: parserExtensionRanges(contextFor(tableOutput), false),
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

    const templateLayoutEnabled =
      resolved.formatTemplates && isRuleEnabled("templates", resolved.level);
    const templateSpacingCompatibilityEnabled =
      resolved.formatTemplateParameters &&
      isRuleEnabled("templateParameters", resolved.level);
    if (templateLayoutEnabled || templateSpacingCompatibilityEnabled) {
      const templateBlocks = protectBlocks(tableOutput, {
        protectTables: false,
        additionalRanges: parserExtensionRanges(contextFor(tableOutput)),
      });
      const templateContext = session.createContext(templateBlocks.text);
      const templates = formatTemplatesWithDiagnostics(
        templateContext,
        {
          lineWidth: resolved.lineWidth,
          layout: templateLayoutEnabled ? "auto" : "preserve",
          parameterSpacing: true,
          inlineTemplateSpacing: resolved.inlineTemplateSpacing,
          parameterLayout: resolved.templateParameterLayout,
        },
      );
      const previous = tableOutput;
      tableOutput = templateBlocks.restore(templates.formatted);
      diagnostics.templateParameterDiagnostics = templates.diagnostics;
      if (templates.diagnostics.convergenceLimitReached) {
        return fallbackDetailedResult(
          source,
          {
            code: "template-convergence",
            stage: "templates",
            message:
              "Template formatting did not converge within its bounded pass limit; left the input unchanged.",
          },
          diagnostics,
        );
      }
      const equivalence =
        previous === tableOutput
          ? { equivalent: true as const, structure: "templates" as const }
          : verifyStructuralEquivalence(
              previous,
              tableOutput,
              "templates",
              session,
            );
      diagnostics.equivalenceDiagnostics.push(equivalence);
      if (!equivalence.equivalent) {
        return fallbackDetailedResult(
          source,
          {
            code: "template-equivalence",
            stage: "templates",
            message: `Structural equivalence failed for templates: ${equivalence.reason}; left the input unchanged.`,
          },
          diagnostics,
        );
      }
      if (tableOutput !== previous) invalidateContext();
    }

    if (resolved.formatLists && isRuleEnabled("lists", resolved.level)) {
      const listContext = contextFor(tableOutput);
      const lists = formatListsWithDiagnostics(
        listContext,
        { verifyCandidate: false },
      );
      diagnostics.listDiagnostics = lists.diagnostics;
      if (lists.formatted !== tableOutput) {
        tableOutput = lists.formatted;
        invalidateContext();
      }
    }

    // Re-protect tables before running rules that do not own table-internal
    // structure. Templates have already run against parser-confirmed nodes so
    // templates inside cells and tables inside templates remain supported.
    const protectedText = protectBlocks(tableOutput, {
      protectTables: true,
      additionalRanges: parserExtensionRanges(contextFor(tableOutput)),
    });
    let output = protectedText.text;
    if (resolved.formatHeadings && isRuleEnabled("headings", resolved.level)) {
      const previous = output;
      output = formatHeadings(output);
      if (output !== previous) invalidateContext();
    }
    if (
      resolved.formatRedirects &&
      isRuleEnabled("redirects", resolved.level)
    ) {
      const redirectContext = contextFor(output);
      const previous = output;
      const redirect = formatRedirects(
        output,
        {
          localizationSource: resolved.localizationSource,
          localizedSyntaxStyle: resolved.localizedSyntaxStyle,
          localizationAliases: resolved.localizationAliases,
        },
        redirectContext,
      );
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
    if (
      resolved.formatWikilinks &&
      isRuleEnabled("wikilinks", resolved.level)
    ) {
      const wikilinkContext = contextFor(output);
      const previous = output;
      const wikilinks = formatWikilinks(
        output,
        { interlanguagePrefixes: resolved.interlanguagePrefixes },
        wikilinkContext,
      );
      output = wikilinks.formatted;
      diagnostics.wikilinkDiagnostics = wikilinks.diagnostics;
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
        footerContext,
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
      );
      output = footer.formatted;
      diagnostics.footerDiagnostics = footer.diagnostics;
      if (output !== footerContext.source) invalidateContext();
    }
    output = protectedText.restore(output);

    let outputRoundTripSafe: boolean;
    try {
      outputRoundTripSafe = session.isRoundTripSafe(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fallbackDetailedResult(
        source,
        {
          code: "output-parse",
          stage: "final-parse",
          message: `The formatted output could not be parsed safely: ${message}; left the input unchanged.`,
        },
        diagnostics,
      );
    }
    if (!outputRoundTripSafe) {
      return fallbackDetailedResult(
        source,
        {
          code: "output-parse",
          stage: "final-parse",
          message:
            "The formatted output did not parse safely; left the input unchanged.",
        },
        diagnostics,
      );
    }
    const documentEquivalence =
      source === output
        ? { equivalent: true as const, structure: "document" as const }
        : verifyStructuralEquivalence(
            source,
            output,
            "document",
            session,
            resolved,
          );
    diagnostics.equivalenceDiagnostics.push(documentEquivalence);
    if (!documentEquivalence.equivalent) {
      return fallbackDetailedResult(
        source,
        {
          code: "document-equivalence",
          stage: documentEquivalence.reason?.split(" ", 1)[0],
          message: `Structural equivalence failed for the document: ${documentEquivalence.reason}; left the input unchanged.`,
        },
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
      {
        code: "formatter-exception",
        stage: "formatting",
        message: `Formatting failed safely: ${message}`,
      },
      diagnostics,
    );
  }
}

function restoreDetailedResult(
  result: FormatDetailedResult,
  normalized: SupportedNormalizedSource,
): FormatDetailedResult {
  if (normalized.lineEnding !== "crlf") return result;
  return {
    ...result,
    formatted: normalized.restore(result.formatted),
    tableDiagnostics: result.tableDiagnostics.map((diagnostic) => ({
      ...diagnostic,
      start: normalized.originalOffset(diagnostic.start),
      end: normalized.originalOffset(diagnostic.end),
    })),
  };
}

function formatWikitextDetailedResultWithSession(
  session: ParserSession,
  source: string,
  resolved: ResolvedFormatOptions,
): FormatDetailedResult {
  const normalized = normalizeSourceLineEndings(source);
  if (!normalized.supported) {
    const detail =
      normalized.lineEnding === "mixed"
        ? "mixed LF and CRLF line endings"
        : "bare carriage returns";
    return fallbackDetailedResult(source, {
      code: "unsupported-line-endings",
      stage: "input-normalization",
      message: `The input uses unsupported ${detail}; left it unchanged.`,
    });
  }
  return restoreDetailedResult(
    formatNormalizedWikitextDetailedResult(
      session,
      normalized.normalized,
      resolved,
    ),
    normalized,
  );
}

function parserConfigFailure(
  source: string,
  error: UnsupportedParserConfigError,
): FormatDetailedResult {
  return fallbackDetailedResult(source, {
    code: "unsupported-parser-config",
    stage: "parser-config",
    message: `${error.message} The input was left unchanged.`,
  });
}

function formatWikitextDetailedResult(
  runtime: ParserRuntime,
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  const normalized = normalizeSourceLineEndings(source);
  if (!normalized.supported) {
    const detail =
      normalized.lineEnding === "mixed"
        ? "mixed LF and CRLF line endings"
        : "bare carriage returns";
    return fallbackDetailedResult(source, {
      code: "unsupported-line-endings",
      stage: "input-normalization",
      message: `The input uses unsupported ${detail}; left it unchanged.`,
    });
  }

  try {
    const resolved = resolveOptions(options);
    const session = runtime.createSession(resolved.parserConfig);
    return restoreDetailedResult(
      formatNormalizedWikitextDetailedResult(
        session,
        normalized.normalized,
        resolved,
      ),
      normalized,
    );
  } catch (error) {
    if (error instanceof UnsupportedParserConfigError) {
      return parserConfigFailure(source, error);
    }
    const message = error instanceof Error ? error.message : String(error);
    return fallbackDetailedResult(source, {
      code: "formatter-exception",
      stage: "formatting",
      message: `Formatting failed safely: ${message}`,
    });
  }
}

function formatWikitextResult(
  runtime: ParserRuntime,
  source: string,
  options: FormatOptions = {},
): FormatResult {
  return stripDiagnostics(
    formatWikitextDetailedResult(runtime, source, options),
  );
}

function formatWikitext(
  runtime: ParserRuntime,
  source: string,
  options: FormatOptions = {},
): string {
  return formatWikitextResult(runtime, source, options).formatted;
}

function formatWikitextSafe(
  runtime: ParserRuntime,
  source: string,
  options: FormatOptions = {},
): FormatResult {
  return stripDiagnostics(formatWikitextSafeDetailed(runtime, source, options));
}

function formatWikitextSafeDetailed(
  runtime: ParserRuntime,
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  let diagnostics = emptyDetailedDiagnostics();
  try {
    const resolved = resolveOptions(options);
    const session = runtime.createSession(resolved.parserConfig);
    const first = formatWikitextDetailedResultWithSession(
      session,
      source,
      resolved,
    );
    diagnostics = {
      tableDiagnostics: first.tableDiagnostics,
      tableFormatDiagnostics: first.tableFormatDiagnostics,
      footerDiagnostics: first.footerDiagnostics,
      redirectDiagnostics: first.redirectDiagnostics,
      fileLinkDiagnostics: first.fileLinkDiagnostics,
      wikilinkDiagnostics: first.wikilinkDiagnostics,
      externalLinkDiagnostics: first.externalLinkDiagnostics,
      referenceDiagnostics: first.referenceDiagnostics,
      listDiagnostics: first.listDiagnostics,
      sectionSpacingDiagnostics: first.sectionSpacingDiagnostics,
      templateParameterDiagnostics: first.templateParameterDiagnostics,
      equivalenceDiagnostics: first.equivalenceDiagnostics,
    };
    if (first.failure)
      return fallbackDetailedResult(source, first.failure, diagnostics);
    if (first.warning) {
      return fallbackDetailedResult(
        source,
        {
          code: "formatter-exception",
          stage: "compatibility-warning",
          message: first.warning,
        },
        diagnostics,
      );
    }
    const second = formatWikitextDetailedResultWithSession(
      session,
      first.formatted,
      resolved,
    );
    if (second.warning) {
      return fallbackDetailedResult(
        source,
        {
          code: "idempotency",
          stage: second.failure?.code ?? "second-pass",
          message: `Safe formatting verification failed: ${second.warning}`,
        },
        diagnostics,
      );
    }
    if (second.formatted !== first.formatted) {
      return fallbackDetailedResult(
        source,
        {
          code: "idempotency",
          stage: "second-pass",
          message:
            "Safe formatting verification failed: output is not idempotent.",
        },
        diagnostics,
      );
    }
    return first;
  } catch (error) {
    if (error instanceof UnsupportedParserConfigError) {
      return parserConfigFailure(source, error);
    }
    const message = error instanceof Error ? error.message : String(error);
    return fallbackDetailedResult(
      source,
      {
        code: "formatter-exception",
        stage: "safe-formatting",
        message: `Safe formatting failed: ${message}`,
      },
      diagnostics,
    );
  }
}

export function createFormatter(runtime: ParserRuntime): FormatterApi {
  return {
    formatWikitext: (source, options) =>
      formatWikitext(runtime, source, options),
    formatWikitextDetailedResult: (source, options) =>
      formatWikitextDetailedResult(runtime, source, options),
    formatWikitextResult: (source, options) =>
      formatWikitextResult(runtime, source, options),
    formatWikitextSafe: (source, options) =>
      formatWikitextSafe(runtime, source, options),
    formatWikitextSafeDetailed: (source, options) =>
      formatWikitextSafeDetailed(runtime, source, options),
  };
}

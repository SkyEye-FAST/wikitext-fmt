import type { FormatOptions } from "./options.js";
import { resolveOptions } from "./options.js";
import { getParserConfig, isRoundTripSafe, parseWikitext } from "./parser.js";
import { normalizeBlankLines } from "./rules/blankLines.js";
import { formatCategories } from "./rules/categories.js";
import { formatHeadings } from "./rules/headings.js";
import { formatTemplates } from "./rules/templates.js";
import { isRuleEnabled } from "./rules/index.js";
import { formatHtmlVoidTags } from "./rules/htmlVoidTags.js";
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
}

export function formatWikitextDetailedResult(
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  const resolved = resolveOptions(options);
  let tableDiagnostics: TableDiagnostic[] = [];
  try {
    const config = getParserConfig(resolved.parserConfig);
    if (!isRoundTripSafe(source, config)) {
      return {
        formatted: source,
        warning: "The parser could not round-trip the input exactly; left it unchanged.",
        tableDiagnostics,
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
      const tableResult = formatTablesWithDiagnostics(tableBlocks.text, config, resolved);
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
                lineDiagnostics: diagnostic.lineDiagnostics.map((lineDiagnostic) => ({
                  ...lineDiagnostic,
                  sourceLine: line + lineDiagnostic.tableLine - 1,
                })),
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
    if (resolved.formatTemplates && isRuleEnabled("templates", resolved.level)) {
      output = formatTemplates(output, config, resolved.lineWidth);
    }
    if (resolved.formatHeadings && isRuleEnabled("headings", resolved.level)) output = formatHeadings(output);
    if (resolved.normalizeBlankLines && isRuleEnabled("blankLines", resolved.level)) {
      output = normalizeBlankLines(output);
    }
    if (isRuleEnabled("htmlVoidTags", resolved.level)) {
      output = formatHtmlVoidTags(output, resolved.htmlVoidTagStyle);
    }
    if (resolved.formatCategories && isRuleEnabled("categories", resolved.level)) {
      output = formatCategories(output, config);
    }
    output = protectedText.restore(output);

    if (!isRoundTripSafe(output, config)) {
      return {
        formatted: source,
        warning: "The formatted output did not parse safely; left the input unchanged.",
        tableDiagnostics,
      };
    }
    return { formatted: output, tableDiagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { formatted: source, warning: `Formatting failed safely: ${message}`, tableDiagnostics };
  }
}

export function formatWikitextResult(source: string, options: FormatOptions = {}): FormatResult {
  const { tableDiagnostics: _tableDiagnostics, ...result } = formatWikitextDetailedResult(source, options);
  return result;
}

export function formatWikitext(source: string, options: FormatOptions = {}): string {
  return formatWikitextResult(source, options).formatted;
}

export function formatWikitextSafe(source: string, options: FormatOptions = {}): FormatResult {
  const { tableDiagnostics: _tableDiagnostics, ...result } = formatWikitextSafeDetailed(source, options);
  return result;
}

export function formatWikitextSafeDetailed(
  source: string,
  options: FormatOptions = {},
): FormatDetailedResult {
  let tableDiagnostics: TableDiagnostic[] = [];
  try {
    const resolved = resolveOptions(options);
    const config = getParserConfig(resolved.parserConfig);
    parseWikitext(source, config);

    const first = formatWikitextDetailedResult(source, options);
    tableDiagnostics = first.tableDiagnostics;
    if (first.warning) return { formatted: source, warning: first.warning, tableDiagnostics };
    parseWikitext(first.formatted, config);

    const second = formatWikitextDetailedResult(first.formatted, options);
    if (second.warning) {
      return {
        formatted: source,
        warning: `Safe formatting verification failed: ${second.warning}`,
        tableDiagnostics,
      };
    }
    parseWikitext(second.formatted, config);
    if (second.formatted !== first.formatted) {
      return {
        formatted: source,
        warning: "Safe formatting verification failed: output is not idempotent.",
        tableDiagnostics,
      };
    }
    return first;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { formatted: source, warning: `Safe formatting failed: ${message}`, tableDiagnostics };
  }
}

import type {
  Config,
  ParameterToken,
  TranscludeToken,
} from "wikiparser-node";
import {
  createParserContext,
  type ParsedDocumentContext,
} from "../parserContext.js";
import { parseWikitext } from "../parser.js";

interface Replacement {
  start: number;
  end: number;
  value: string;
  expanded: boolean;
  normalizedMultiline: boolean;
}

export interface TemplateDiagnostics {
  templatesInspected: number;
  templatesFormatted: number;
  templatesExpandedToMultiline: number;
  existingMultilineTemplatesNormalized: number;
  templatesSkipped: number;
  skipReasons: Record<string, number>;
  formattingPassesUsed: number;
  convergenceLimitReached: boolean;
  /** @deprecated Compatibility counters for the pre-1.0 API. */
  templateParametersFormatted: number;
  /** @deprecated Compatibility counters for the pre-1.0 API. */
  templateParameterLinesFormatted: number;
  /** @deprecated Compatibility counters for the pre-1.0 API. */
  templateParameterLinesSkippedUnsafe: number;
}

export interface TemplateFormatResult {
  formatted: string;
  diagnostics: TemplateDiagnostics;
}

export interface TemplateFormatOptions {
  lineWidth: number;
  layout: "auto" | "preserve";
  parameterSpacing: boolean;
  maxPasses?: number;
}

type TemplateNode = TranscludeToken & {
  getAbsoluteIndex(): number;
  parentNode?: { closest(selector: string): unknown };
  querySelectorAll<T = unknown>(selector: string): T[];
};

function emptyDiagnostics(): TemplateDiagnostics {
  return {
    templatesInspected: 0,
    templatesFormatted: 0,
    templatesExpandedToMultiline: 0,
    existingMultilineTemplatesNormalized: 0,
    templatesSkipped: 0,
    skipReasons: {},
    formattingPassesUsed: 0,
    convergenceLimitReached: false,
    templateParametersFormatted: 0,
    templateParameterLinesFormatted: 0,
    templateParameterLinesSkippedUnsafe: 0,
  };
}

function incrementReason(
  diagnostics: TemplateDiagnostics,
  reason: string,
): void {
  diagnostics.skipReasons[reason] =
    (diagnostics.skipReasons[reason] ?? 0) + 1;
}

function collectTemplateNodes(
  context: ParsedDocumentContext,
): TemplateNode[] {
  return [
    ...context.root.querySelectorAll<TemplateNode>("template"),
    ...context.root.querySelectorAll<TemplateNode>("magic-word"),
  ].sort((a, b) => a.getAbsoluteIndex() - b.getAbsoluteIndex());
}

function renderArgument(arg: ParameterToken): string | undefined {
  const rawValue = arg.lastChild.toString();
  const value = arg.anon ? rawValue.replace(/^[\t ]+/u, "") : rawValue.trim();
  if (arg.anon) return `| ${value}`;
  const key = arg.firstChild.toString().trim();
  if (!key) return undefined;
  return `| ${key} = ${value}`;
}

function containsNestedStructure(arg: ParameterToken): boolean {
  return [
    "template",
    "magic-word",
    "table",
    "link",
    "ext-link",
    "ext",
    "html",
  ].some((selector) => arg.lastChild.querySelectorAll(selector).length > 0);
}

function appendLine(output: string, line: string): string {
  return `${output}${output.endsWith("\n") ? "" : "\n"}${line}`;
}

function renderTemplate(
  node: TemplateNode,
  config: Config,
  options: TemplateFormatOptions,
): { value?: string; reason?: string; multiline?: boolean } {
  const raw = node.toString();
  if (!raw.startsWith("{{") || !raw.endsWith("}}")) {
    return { reason: "parser node does not have balanced template delimiters" };
  }
  const args = node.getAllArgs();
  if (args.length === 0) return { value: raw, multiline: false };
  if (raw.includes("{|") && node.querySelectorAll("table").length === 0) {
    const opener = raw.indexOf("{|");
    const reparsed = parseWikitext(raw.slice(opener), config).querySelector<{
      closed?: boolean;
      getAbsoluteIndex(): number;
    }>("table");
    if (!reparsed || reparsed.getAbsoluteIndex() !== 0 || !reparsed.closed) {
      return {
        reason: "table opener is not represented by a balanced parser table node",
      };
    }
    return {
      reason:
        "template parameter boundaries overlap an embedded table parser node",
    };
  }

  const start = node.getAbsoluteIndex();
  const firstArgStart = args[0]!.getAbsoluteIndex() - start;
  const firstDelimiter = raw[firstArgStart - 1];
  if (firstDelimiter !== "|" && firstDelimiter !== ":") {
    return { reason: "parser did not expose a stable first-argument delimiter" };
  }
  const head = raw.slice(2, firstArgStart - 1).trim();
  if (!head) return { reason: "template name is empty" };
  if (node.type === "magic-word" && !head.startsWith("#")) {
    return { value: raw, multiline: raw.includes("\n") };
  }

  const renderedArgs = args.map(renderArgument);
  if (renderedArgs.some((arg) => arg === undefined)) {
    return { reason: "parser exposed an empty named-parameter key" };
  }

  const wasMultiline = raw.includes("\n");
  const nestedStructure = args.some(containsNestedStructure);
  const compactArgs = renderedArgs.map((arg) => arg!.slice(1).trimStart());
  const compact =
    firstDelimiter === ":"
      ? `{{${head}: ${compactArgs.join(" | ")}}}`
      : `{{${head}| ${compactArgs.join(" | ")}}}`;
  const autoMultiline =
    options.layout === "auto" &&
    (args.length > 1 ||
      nestedStructure ||
      raw.length > options.lineWidth ||
      compact.length > options.lineWidth);
  const multiline = wasMultiline || autoMultiline;

  if (!multiline) {
    if (options.layout === "preserve" || !options.parameterSpacing) {
      return { value: raw, multiline: false };
    }
    return { value: compact, multiline: false };
  }

  let output = `{{${head}`;
  for (let index = 0; index < renderedArgs.length; index++) {
    const rendered = renderedArgs[index]!;
    if (index === 0 && firstDelimiter === ":") {
      const value = rendered.slice(1).trimStart();
      output += `: ${value}`;
    } else {
      output = appendLine(output, rendered);
    }
  }
  output = appendLine(output.replace(/[\t ]+$/u, ""), "}}");
  return { value: output, multiline: true };
}

function hasChangedDescendant(
  replacement: Replacement,
  replacements: readonly Replacement[],
): boolean {
  return replacements.some(
    (candidate) =>
      candidate !== replacement &&
      candidate.start > replacement.start &&
      candidate.end < replacement.end,
  );
}

export function formatTemplatesWithDiagnostics(
  source: string,
  config: Config,
  options: TemplateFormatOptions,
  context?: ParsedDocumentContext,
): TemplateFormatResult {
  const diagnostics = emptyDiagnostics();
  const maxPasses = options.maxPasses ?? 64;
  let output = source;
  let firstContext = context?.source === source ? context : undefined;
  let originalMultiline: boolean[] = [];

  for (let pass = 0; pass < maxPasses; pass++) {
    const currentContext =
      firstContext ?? createParserContext(output, config);
    firstContext = undefined;
    const nodes = collectTemplateNodes(currentContext);
    if (pass === 0) {
      diagnostics.templatesInspected = nodes.length;
      originalMultiline = nodes.map((node) => node.toString().includes("\n"));
    }
    const changed: Replacement[] = [];

    for (const [nodeIndex, node] of nodes.entries()) {
      const raw = node.toString();
      const rendered = renderTemplate(node, config, options);
      if (rendered.reason) {
        if (pass === 0) incrementReason(diagnostics, rendered.reason);
        continue;
      }
      if (rendered.value === undefined || rendered.value === raw) continue;
      const start = node.getAbsoluteIndex();
      changed.push({
        start,
        end: start + raw.length,
        value: rendered.value,
        expanded:
          originalMultiline[nodeIndex] === false && rendered.multiline === true,
        normalizedMultiline: originalMultiline[nodeIndex] === true,
      });
    }

    if (changed.length === 0) {
      diagnostics.formattingPassesUsed = pass;
      diagnostics.templatesSkipped = Object.values(
        diagnostics.skipReasons,
      ).reduce((sum, count) => sum + count, 0);
      return { formatted: output, diagnostics };
    }

    const deepest = changed.filter(
      (replacement) => !hasChangedDescendant(replacement, changed),
    );
    for (const replacement of deepest.sort((a, b) => b.start - a.start)) {
      output =
        output.slice(0, replacement.start) +
        replacement.value +
        output.slice(replacement.end);
      diagnostics.templatesFormatted++;
      diagnostics.templateParametersFormatted++;
      diagnostics.templateParameterLinesFormatted +=
        replacement.value.split("\n").filter((line) => /^\|/u.test(line))
          .length;
      if (replacement.expanded) diagnostics.templatesExpandedToMultiline++;
      if (replacement.normalizedMultiline)
        diagnostics.existingMultilineTemplatesNormalized++;
    }
    diagnostics.formattingPassesUsed = pass + 1;
  }

  diagnostics.convergenceLimitReached = true;
  incrementReason(diagnostics, `did not converge within ${maxPasses} passes`);
  diagnostics.templatesSkipped = Object.values(diagnostics.skipReasons).reduce(
    (sum, count) => sum + count,
    0,
  );
  return { formatted: source, diagnostics };
}

export function formatTemplates(
  source: string,
  config: Config,
  lineWidth: number,
  context?: ParsedDocumentContext,
): string {
  return formatTemplatesWithDiagnostics(
    source,
    config,
    { lineWidth, layout: "auto", parameterSpacing: true },
    context,
  ).formatted;
}

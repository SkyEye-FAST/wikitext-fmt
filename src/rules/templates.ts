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
  templatesEligible: number;
  templatesChanged: number;
  templatesAlreadyCanonical: number;
  templatesSkippedAmbiguous: number;
  uniqueTemplatesFormatted: number;
  /** @deprecated Use uniqueTemplatesFormatted. */
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
    templatesEligible: 0,
    templatesChanged: 0,
    templatesAlreadyCanonical: 0,
    templatesSkippedAmbiguous: 0,
    uniqueTemplatesFormatted: 0,
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
  if (arg.anon) return `|${rawValue}`;
  const value = rawValue.trim();
  const key = arg.firstChild.toString().trim();
  if (!key) return undefined;
  return `| ${key} = ${value}`;
}

function normalizeNamedArgumentsInPlace(
  raw: string,
  nodeStart: number,
  args: readonly ParameterToken[],
): { value?: string; reason?: string } {
  const replacements = args
    .filter((arg) => !arg.anon)
    .map((arg) => {
      const key = arg.firstChild.toString().trim();
      if (!key) return undefined;
      const start = arg.getAbsoluteIndex() - nodeStart;
      return {
        start,
        end: start + arg.toString().length,
        value: `${key} = ${arg.lastChild.toString().trim()}`,
      };
    });
  if (replacements.some((replacement) => replacement === undefined)) {
    return { reason: "parser exposed an empty named-parameter key" };
  }
  let value = raw;
  for (const replacement of replacements
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) => b.start - a.start)) {
    value =
      value.slice(0, replacement.start) +
      replacement.value +
      value.slice(replacement.end);
  }
  return { value };
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
  if (node.type === "magic-word") {
    return { value: raw, multiline: raw.includes("\n") };
  }

  if (args.some((arg) => arg.anon)) {
    if (options.layout === "preserve" || !options.parameterSpacing) {
      return { value: raw, multiline: raw.includes("\n") };
    }
    const normalized = normalizeNamedArgumentsInPlace(raw, start, args);
    return {
      ...normalized,
      multiline: raw.includes("\n"),
    };
  }

  const renderedArgs = args.map(renderArgument);
  if (renderedArgs.some((arg) => arg === undefined)) {
    return { reason: "parser exposed an empty named-parameter key" };
  }

  const wasMultiline = raw.includes("\n");
  const nestedStructure = args.some(containsNestedStructure);
  const compact = `{{${head}${renderedArgs.join("")}}}`;
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
    output = appendLine(output, rendered);
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
  const changedNodeIndices = new Set<number>();
  const expandedNodeIndices = new Set<number>();
  const normalizedNodeIndices = new Set<number>();

  const finalize = (formatted: string): TemplateFormatResult => {
    diagnostics.templatesChanged = changedNodeIndices.size;
    diagnostics.uniqueTemplatesFormatted = changedNodeIndices.size;
    diagnostics.templatesFormatted = changedNodeIndices.size;
    diagnostics.templatesExpandedToMultiline = expandedNodeIndices.size;
    diagnostics.existingMultilineTemplatesNormalized =
      normalizedNodeIndices.size;
    diagnostics.templatesSkippedAmbiguous = Object.values(
      diagnostics.skipReasons,
    ).reduce((sum, count) => sum + count, 0);
    diagnostics.templatesSkipped = diagnostics.templatesSkippedAmbiguous;
    diagnostics.templatesEligible = diagnostics.templatesInspected;
    diagnostics.templatesAlreadyCanonical = Math.max(
      0,
      diagnostics.templatesEligible -
        diagnostics.templatesChanged -
        diagnostics.templatesSkippedAmbiguous,
    );
    diagnostics.templateParametersFormatted = changedNodeIndices.size;
    return { formatted, diagnostics };
  };

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
      return finalize(output);
    }

    const deepest = changed.filter(
      (replacement) => !hasChangedDescendant(replacement, changed),
    );
    for (const replacement of deepest.sort((a, b) => b.start - a.start)) {
      output =
        output.slice(0, replacement.start) +
        replacement.value +
        output.slice(replacement.end);
      const semanticNodeIndex = nodes.findIndex(
        (node) => node.getAbsoluteIndex() === replacement.start,
      );
      if (semanticNodeIndex >= 0) changedNodeIndices.add(semanticNodeIndex);
      diagnostics.templateParameterLinesFormatted +=
        replacement.value.split("\n").filter((line) => /^\|/u.test(line))
          .length;
      if (replacement.expanded && semanticNodeIndex >= 0)
        expandedNodeIndices.add(semanticNodeIndex);
      if (replacement.normalizedMultiline && semanticNodeIndex >= 0)
        normalizedNodeIndices.add(semanticNodeIndex);
    }
    diagnostics.formattingPassesUsed = pass + 1;
  }

  diagnostics.convergenceLimitReached = true;
  incrementReason(diagnostics, `did not converge within ${maxPasses} passes`);
  changedNodeIndices.clear();
  expandedNodeIndices.clear();
  normalizedNodeIndices.clear();
  return finalize(source);
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

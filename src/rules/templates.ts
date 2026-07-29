import type {
  Config,
  ParameterToken,
  TranscludeToken,
} from "wikiparser-node";
import type { TemplateParameterLayout } from "../options.js";
import {
  createParserContext,
  type ParsedDocumentContext,
} from "../parserContext.js";
import { templateStructuralFingerprint } from "../equivalence.js";
import { isRoundTripSafe, parseWikitext } from "../parser.js";
import { semanticRangeIdentities } from "../semanticIdentity.js";
import { classifyParserFunction } from "../parserFunctionPolicy.js";
import {
  collectParserTableCandidates,
  potentialParserTableOpenerPositions,
} from "./tables.js";

interface Replacement {
  start: number;
  end: number;
  value: string;
  semanticId: string;
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
  templateSemanticIds: string[];
  changedTemplateSemanticIds: string[];
}

export interface TemplateFormatResult {
  formatted: string;
  diagnostics: TemplateDiagnostics;
}

export interface TemplateFormatOptions {
  lineWidth: number;
  layout: "auto" | "preserve";
  parameterSpacing: boolean;
  parameterLayout: TemplateParameterLayout;
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
    templateSemanticIds: [],
    changedTemplateSemanticIds: [],
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

function renderNamedArgument(
  arg: ParameterToken,
  spacing: "compact" | "spaced",
): string | undefined {
  if (arg.anon) return undefined;
  const rawValue = arg.lastChild.toString();
  const value = rawValue.trim();
  const key = arg.firstChild.toString().trim();
  if (!key) return undefined;
  const lineSensitiveBlock =
    /^[ \t]*\r?\n/u.test(rawValue) &&
    /^(?:[*#:;]+|\{\||={1,6}(?:[ \t]|$))/u.test(value);
  if (spacing === "compact") {
    return lineSensitiveBlock ? `|${key}=\n${value}` : `|${key}=${value}`;
  }
  return lineSensitiveBlock ? `| ${key} =\n${value}` : `| ${key} = ${value}`;
}

function renderArgument(arg: ParameterToken): string | undefined {
  if (arg.anon) return `|${arg.lastChild.toString()}`;
  return renderNamedArgument(arg, "spaced");
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
    "comment",
  ].some((selector) => arg.lastChild.querySelectorAll(selector).length > 0);
}

function appendLine(output: string, line: string): string {
  return `${output}${output.endsWith("\n") ? "" : "\n"}${line}`;
}

function renderMultilineArguments(
  head: string,
  renderedArgs: readonly string[],
  layout: TemplateParameterLayout,
): string {
  let output = `{{${head}`;
  const indent = layout === "indented" ? " " : "";
  for (const rendered of renderedArgs) {
    output = appendLine(output, `${indent}${rendered}`);
  }
  return appendLine(output.replace(/[\t ]+$/u, ""), "}}");
}

const INLINE_ANONYMOUS_ARGUMENT_LIMIT = 3;

function anonymousLayoutCandidates(
  node: TemplateNode,
  collapseAnonymous: boolean,
): { candidates: string[]; reason?: string } {
  const raw = node.toString();
  const args = node.getAllArgs();
  const start = node.getAbsoluteIndex();
  const firstArgStart = args[0]!.getAbsoluteIndex() - start;
  const head = raw.slice(2, firstArgStart - 1).trim();
  const renderedArgs = args.map(renderArgument);
  if (renderedArgs.some((arg) => arg === undefined)) {
    return {
      candidates: [],
      reason: "parser exposed an empty named-parameter key",
    };
  }

  const rendered = renderedArgs.filter(
    (arg): arg is string => arg !== undefined,
  );
  const compact = `{{${head}${rendered.join("")}}}`;
  const candidates: string[] = [];
  const inlineEligible =
    collapseAnonymous &&
    args.length <= INLINE_ANONYMOUS_ARGUMENT_LIMIT &&
    !args.some(containsNestedStructure) &&
    !/[\r\n]/u.test(compact);
  if (inlineEligible) {
    candidates.push(compact);
  }
  const normalized = normalizeNamedArgumentsInPlace(raw, start, args);
  if (normalized.reason) {
    return { candidates: [], reason: normalized.reason };
  }
  candidates.push(normalized.value ?? raw, raw);
  return { candidates: [...new Set(candidates)] };
}

function findOwningTemplate(source: string, config: Config): TemplateNode | undefined {
  return parseWikitext(source, config)
    .querySelectorAll<TemplateNode>("template")
    .find(
      (candidate) =>
        candidate.getAbsoluteIndex() === 0 && candidate.toString() === source,
    );
}

function protectEmbeddedParserTables(
  source: string,
  config: Config,
): { text?: string; restore(value: string): string; reason?: string } {
  const context = createParserContext(source, config);
  const confirmed = collectParserTableCandidates(source, context, config)
    .filter(
      (candidate) =>
        candidate.start >= 0 &&
        candidate.end <= source.length &&
        candidate.end > candidate.start,
    )
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const candidate of confirmed) {
    if (
      ranges.some(
        (range) =>
          range.start <= candidate.start && range.end >= candidate.end,
      )
    ) {
      continue;
    }
    ranges.push({ start: candidate.start, end: candidate.end });
  }

  for (const opener of potentialParserTableOpenerPositions(source)) {
    if (
      !ranges.some((range) => range.start <= opener && range.end > opener)
    ) {
      return {
        restore: (value) => value,
        reason: "table opener is not represented by a balanced parser table node",
      };
    }
  }

  const values = ranges.map((range) => source.slice(range.start, range.end));
  const placeholders = values.map((_value, index) => {
    let placeholder = `\uE100wikitext-fmt-table-${index}\uE101`;
    while (source.includes(placeholder)) placeholder = `\uE100${placeholder}\uE101`;
    return placeholder;
  });
  let text = source;
  for (let index = ranges.length - 1; index >= 0; index--) {
    const range = ranges[index]!;
    text =
      text.slice(0, range.start) +
      placeholders[index]! +
      text.slice(range.end);
  }
  return {
    text,
    restore(value: string): string {
      let restored = value;
      for (let index = 0; index < placeholders.length; index++) {
        restored = restored.replaceAll(placeholders[index]!, values[index]!);
      }
      return restored;
    },
  };
}

function renderTemplateWithOpaqueTables(
  raw: string,
  config: Config,
  options: TemplateFormatOptions,
): { value?: string; reason?: string; multiline?: boolean } {
  const protectedTables = protectEmbeddedParserTables(raw, config);
  if (protectedTables.reason) return { reason: protectedTables.reason };
  const protectedNode = findOwningTemplate(protectedTables.text!, config);
  if (!protectedNode) {
    return {
      reason: "parser did not expose an owning template around embedded tables",
    };
  }
  const rendered = renderTemplate(protectedNode, config, options, false);
  if (rendered.reason || rendered.value === undefined) return rendered;
  const value = protectedTables.restore(rendered.value);
  try {
    if (
      !isRoundTripSafe(value, config) ||
      templateStructuralFingerprint(value, config) !==
        templateStructuralFingerprint(raw, config)
    ) {
      return { value: raw, multiline: raw.includes("\n") };
    }
  } catch {
    return { value: raw, multiline: raw.includes("\n") };
  }
  return { value, multiline: value.includes("\n") };
}

function selectAnonymousLayoutCandidate(
  node: TemplateNode,
  config: Config,
  collapseAnonymous: boolean,
  requireIdempotency: boolean,
): { value?: string; reason?: string; multiline?: boolean } {
  const raw = node.toString();
  const generated = anonymousLayoutCandidates(node, collapseAnonymous);
  if (generated.reason) return { reason: generated.reason };

  let originalFingerprint: string;
  try {
    originalFingerprint = templateStructuralFingerprint(raw, config);
  } catch {
    return { reason: "template candidate could not be structurally fingerprinted" };
  }

  for (const candidate of generated.candidates) {
    try {
      if (
        !isRoundTripSafe(candidate, config) ||
        templateStructuralFingerprint(candidate, config) !== originalFingerprint
      ) {
        continue;
      }
      if (requireIdempotency) {
        const reparsed = findOwningTemplate(candidate, config);
        if (!reparsed) continue;
        const regenerated = anonymousLayoutCandidates(
          reparsed,
          collapseAnonymous,
        );
        if (
          regenerated.reason ||
          regenerated.candidates[0] !== candidate
        ) {
          continue;
        }
      }
      return { value: candidate, multiline: candidate.includes("\n") };
    } catch {
      continue;
    }
  }
  return { value: raw, multiline: raw.includes("\n") };
}

function renderTemplate(
  node: TemplateNode,
  config: Config,
  options: TemplateFormatOptions,
  collapseAnonymous = true,
): { value?: string; reason?: string; multiline?: boolean } {
  const raw = node.toString();
  if (!raw.startsWith("{{") || !raw.endsWith("}}")) {
    return { reason: "parser node does not have balanced template delimiters" };
  }
  const args = node.getAllArgs();
  if (args.length === 0) return { value: raw, multiline: false };
  if (potentialParserTableOpenerPositions(raw).length > 0) {
    return renderTemplateWithOpaqueTables(raw, config, options);
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
    classifyParserFunction(node.name);
    return { value: raw, multiline: raw.includes("\n") };
  }

  if (args.some((arg) => arg.anon)) {
    if (options.layout === "preserve" || !options.parameterSpacing) {
      return { value: raw, multiline: raw.includes("\n") };
    }
    return selectAnonymousLayoutCandidate(
      node,
      config,
      collapseAnonymous,
      true,
    );
  }

  const multilineSpacing =
    options.parameterLayout === "compact" ? "compact" : "spaced";
  const renderedArgs = args.map((arg) =>
    renderNamedArgument(arg, multilineSpacing),
  );
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

  return {
    value: renderMultilineArguments(
      head,
      renderedArgs.filter((arg): arg is string => arg !== undefined),
      options.parameterLayout,
    ),
    multiline: true,
  };
}

function closestTemplateAncestor(node: TemplateNode): TemplateNode | undefined {
  return node.parentNode?.closest("template, magic-word") as
    | TemplateNode
    | undefined;
}

function hasTableSyntaxMagicWord(node: TemplateNode): boolean {
  return node
    .querySelectorAll<TemplateNode>("magic-word")
    .some((candidate) => candidate.name === "!");
}

function applyReplacements(
  source: string,
  replacements: readonly Replacement[],
): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const replacement of [...replacements].sort(
    (a, b) => a.start - b.start,
  )) {
    parts.push(source.slice(cursor, replacement.start), replacement.value);
    cursor = replacement.end;
  }
  parts.push(source.slice(cursor));
  return parts.join("");
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
  const originalMultiline = new Map<string, boolean>();
  const changedNodeIds = new Set<string>();
  const expandedNodeIds = new Set<string>();
  const normalizedNodeIds = new Set<string>();
  const canonicalNodeIds = new Set<string>();

  const finalize = (formatted: string): TemplateFormatResult => {
    diagnostics.templatesChanged = changedNodeIds.size;
    diagnostics.uniqueTemplatesFormatted = changedNodeIds.size;
    diagnostics.templatesFormatted = changedNodeIds.size;
    diagnostics.templatesExpandedToMultiline = expandedNodeIds.size;
    diagnostics.existingMultilineTemplatesNormalized =
      normalizedNodeIds.size;
    diagnostics.templatesSkippedAmbiguous = Object.values(
      diagnostics.skipReasons,
    ).reduce((sum, count) => sum + count, 0);
    diagnostics.templatesSkipped = diagnostics.templatesSkippedAmbiguous;
    diagnostics.templatesEligible = Math.max(
      0,
      diagnostics.templatesInspected - diagnostics.templatesSkippedAmbiguous,
    );
    diagnostics.templatesAlreadyCanonical = Math.max(
      0,
      diagnostics.templatesEligible - diagnostics.templatesChanged,
    );
    diagnostics.templateParametersFormatted = changedNodeIds.size;
    diagnostics.changedTemplateSemanticIds = [...changedNodeIds];
    return { formatted, diagnostics };
  };

  if (maxPasses === 0) {
    const nodes = collectTemplateNodes(
      firstContext ?? createParserContext(output, config),
    );
    const semanticIds = semanticRangeIdentities(
      nodes.map((node) => ({
        start: node.getAbsoluteIndex(),
        end: node.getAbsoluteIndex() + node.toString().length,
      })),
      "template",
    );
    diagnostics.templatesInspected = nodes.length;
    diagnostics.templateSemanticIds = semanticIds;
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    const currentContext =
      firstContext ?? createParserContext(output, config);
    firstContext = undefined;
    const nodes = collectTemplateNodes(currentContext);
    const semanticIds = semanticRangeIdentities(
      nodes.map((node) => ({
        start: node.getAbsoluteIndex(),
        end: node.getAbsoluteIndex() + node.toString().length,
      })),
      "template",
    );
    if (pass === 0) {
      diagnostics.templatesInspected = nodes.length;
      diagnostics.templateSemanticIds = semanticIds;
      for (const [nodeIndex, node] of nodes.entries()) {
        originalMultiline.set(
          semanticIds[nodeIndex]!,
          node.toString().includes("\n"),
        );
      }
    }
    const changed: Replacement[] = [];
    const changedAncestors = new Set<TemplateNode>();

    const visitOrder = nodes
      .map((node, nodeIndex) => ({ node, nodeIndex }))
      .sort(
        (a, b) =>
          a.node.toString().length - b.node.toString().length ||
          b.node.getAbsoluteIndex() - a.node.getAbsoluteIndex(),
      );
    for (const { nodeIndex, node } of visitOrder) {
      const semanticId = semanticIds[nodeIndex]!;
      if (canonicalNodeIds.has(semanticId)) continue;
      const raw = node.toString();
      const start = node.getAbsoluteIndex();
      const end = start + raw.length;
      if (changedAncestors.has(node)) continue;
      if (
        !raw.includes("\n") &&
        node.parentNode?.closest("table") &&
        hasTableSyntaxMagicWord(node)
      ) {
        canonicalNodeIds.add(semanticId);
        continue;
      }
      const rendered = renderTemplate(node, config, options);
      if (rendered.reason) {
        if (pass === 0) incrementReason(diagnostics, rendered.reason);
        continue;
      }
      if (rendered.value === undefined || rendered.value === raw) {
        canonicalNodeIds.add(semanticId);
        continue;
      }
      changed.push({
        start,
        end,
        value: rendered.value,
        semanticId,
        expanded:
          originalMultiline.get(semanticId) === false &&
          rendered.multiline === true,
        normalizedMultiline: originalMultiline.get(semanticId) === true,
      });
      let ancestor = closestTemplateAncestor(node);
      while (ancestor) {
        changedAncestors.add(ancestor);
        ancestor = closestTemplateAncestor(ancestor);
      }
    }

    if (changed.length === 0) {
      diagnostics.formattingPassesUsed = pass;
      return finalize(output);
    }

    output = applyReplacements(output, changed);
    for (const replacement of changed) {
      changedNodeIds.add(replacement.semanticId);
      canonicalNodeIds.add(replacement.semanticId);
      diagnostics.templateParameterLinesFormatted +=
        replacement.value
          .split("\n")
          .filter((line) => /^[ \t]*\|/u.test(line)).length;
      if (replacement.expanded) expandedNodeIds.add(replacement.semanticId);
      if (replacement.normalizedMultiline)
        normalizedNodeIds.add(replacement.semanticId);
    }
    diagnostics.formattingPassesUsed = pass + 1;
  }

  diagnostics.convergenceLimitReached = true;
  diagnostics.skipReasons = {
    [`did not converge within ${maxPasses} passes`]:
      diagnostics.templatesInspected,
  };
  changedNodeIds.clear();
  expandedNodeIds.clear();
  normalizedNodeIds.clear();
  canonicalNodeIds.clear();
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
    {
      lineWidth,
      layout: "auto",
      parameterSpacing: true,
      parameterLayout: "flush",
    },
    context,
  ).formatted;
}

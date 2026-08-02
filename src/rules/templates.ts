import type { Config, ParameterToken, TranscludeToken } from "wikiparser-node";
import type {
  InlineTemplateSpacing,
  TemplateParameterLayout,
} from "../options.js";
import type { ParsedDocumentContext } from "../parserContext.js";
import {
  templateStructuralFingerprint,
  templateTokenStructuralFingerprint,
} from "../equivalenceEngine.js";
import type { ParserSession } from "../parserRuntime.js";
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
  templatesExpandedToMultiline: number;
  existingMultilineTemplatesNormalized: number;
  templatesSkipped: number;
  skipReasons: Record<string, number>;
  formattingPassesUsed: number;
  convergenceLimitReached: boolean;
  templateSemanticIds: string[];
  changedTemplateSemanticIds: string[];
}

export interface TemplateFormatResult {
  formatted: string;
  diagnostics: TemplateDiagnostics;
}

export interface TemplateFormatOptions {
  lineWidth: number;
  inlineTemplateSpacing: InlineTemplateSpacing;
  parameterLayout: TemplateParameterLayout;
  maxPasses?: number;
}

type TemplateNode = TranscludeToken & {
  getAbsoluteIndex(): number;
  parentNode?: { closest(selector: string): unknown };
  querySelectorAll<T = unknown>(selector: string): T[];
};

function templateArguments(node: TemplateNode): ParameterToken[] {
  return node.childNodes.filter(
    (child): child is ParameterToken => child.type === "parameter",
  );
}

function emptyDiagnostics(): TemplateDiagnostics {
  return {
    templatesInspected: 0,
    templatesEligible: 0,
    templatesChanged: 0,
    templatesAlreadyCanonical: 0,
    templatesSkippedAmbiguous: 0,
    uniqueTemplatesFormatted: 0,
    templatesExpandedToMultiline: 0,
    existingMultilineTemplatesNormalized: 0,
    templatesSkipped: 0,
    skipReasons: {},
    formattingPassesUsed: 0,
    convergenceLimitReached: false,
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

type CanonicalInlineTemplateSpacing = Exclude<
  InlineTemplateSpacing,
  "auto"
>;

function trimAsciiLayoutWhitespace(value: string): string {
  // Template names, named keys, and ordinary named values are exposed at
  // parser-confirmed syntax boundaries. Newlines are included deliberately so
  // multiline delimiter layout keeps its existing normalization, while
  // non-ASCII whitespace remains semantic content.
  return value
    .replace(/^[ \t\r\n]+/u, "")
    .replace(/[ \t\r\n]+$/u, "");
}

function normalizeTemplateInvocationTitle(title: string): string {
  return title.replaceAll("_", " ");
}

interface StableTemplateInvocation {
  normalizedRaw: string;
  title: string;
}

function stableTemplateInvocation(
  node: TemplateNode,
): StableTemplateInvocation | { reason: string } {
  const raw = node.toString();
  const title = node.firstChild;
  if (title.type !== "template-name") {
    return { reason: "unstable invocation title" };
  }
  if (title.childNodes.some((child) => child.type !== "text")) {
    return { reason: "dynamic template name" };
  }

  const nodeStart = node.getAbsoluteIndex();
  const start = title.getAbsoluteIndex() - nodeStart;
  const source = title.toString();
  const end = start + source.length;
  if (
    start < 2 ||
    end > raw.length - 2 ||
    raw.slice(start, end) !== source
  ) {
    return { reason: "unstable invocation title" };
  }

  return {
    normalizedRaw:
      raw.slice(0, start) +
      normalizeTemplateInvocationTitle(source) +
      raw.slice(end),
    title: source,
  };
}

function isConfiguredMagicWordLikeTitle(title: string, config: Config): boolean {
  const trimmed = trimAsciiLayoutWhitespace(title);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(trimmed)) return false;
  const collapsed = trimmed.replaceAll("_", "").toLowerCase();
  return config.variable.includes(collapsed);
}

interface NamedArgumentValue {
  value: string;
  leadingLineBreak?: string;
}

const LINE_SENSITIVE_VALUE_START =
  /^(?:[ \t]*(?:[*#:;]+|\{\||={1,6}(?:[ \t]|$))|\uE100wikitext-fmt-table-)/u;

function normalizeNamedArgumentValue(rawValue: string): NamedArgumentValue {
  const leadingLineBreak = /^[ \t]*(\r?\n)/u.exec(rawValue);
  if (leadingLineBreak?.[1]) {
    const value = rawValue
      .slice(leadingLineBreak[0].length)
      .replace(/[ \t\r\n]+$/u, "");
    if (!value || !LINE_SENSITIVE_VALUE_START.test(value)) {
      return { value: trimAsciiLayoutWhitespace(value) };
    }
    return {
      leadingLineBreak: leadingLineBreak[1],
      // The first line break is syntax layout after "=". Preserve indentation
      // and other value bytes after it, including non-ASCII whitespace.
      value,
    };
  }
  return { value: trimAsciiLayoutWhitespace(rawValue) };
}

function renderInlineNamedArgument(
  arg: ParameterToken,
  spacing: CanonicalInlineTemplateSpacing,
): string | undefined {
  if (arg.anon) return undefined;
  const { value, leadingLineBreak } = normalizeNamedArgumentValue(
    arg.lastChild.toString(),
  );
  const key = trimAsciiLayoutWhitespace(arg.firstChild.toString());
  if (!key) return undefined;
  if (spacing === "compact") {
    return leadingLineBreak
      ? `|${key}=${leadingLineBreak}${value}`
      : `|${key}=${value}`;
  }
  return leadingLineBreak
    ? ` | ${key} =${leadingLineBreak}${value}`
    : ` | ${key} = ${value}`;
}

function renderMultilineNamedArgument(
  arg: ParameterToken,
  layout: TemplateParameterLayout,
): string | undefined {
  if (arg.anon) return undefined;
  const { value, leadingLineBreak } = normalizeNamedArgumentValue(
    arg.lastChild.toString(),
  );
  const key = trimAsciiLayoutWhitespace(arg.firstChild.toString());
  if (!key) return undefined;
  if (layout === "compact") {
    return leadingLineBreak
      ? `|${key}=${leadingLineBreak}${value}`
      : `|${key}=${value}`;
  }
  return leadingLineBreak
    ? `| ${key} =${leadingLineBreak}${value}`
    : `| ${key} = ${value}`;
}

function renderAnonymousSafeArgument(arg: ParameterToken): string | undefined {
  if (arg.anon) return `|${arg.lastChild.toString()}`;
  return renderInlineNamedArgument(arg, "compact");
}

function normalizeNamedArgumentsInPlace(
  raw: string,
  nodeStart: number,
  args: readonly ParameterToken[],
): { value?: string; reason?: string } {
  const replacements = args
    .filter((arg) => !arg.anon)
    .map((arg) => {
      const key = trimAsciiLayoutWhitespace(arg.firstChild.toString());
      if (!key) return undefined;
      const start = arg.getAbsoluteIndex() - nodeStart;
      const normalizedValue = normalizeNamedArgumentValue(
        arg.lastChild.toString(),
      );
      return {
        start,
        end: start + arg.toString().length,
        value: `${key}=${normalizedValue.leadingLineBreak ?? ""}${
          normalizedValue.value
        }`,
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

function renderInlineTemplate(
  head: string,
  args: readonly ParameterToken[],
  spacing: CanonicalInlineTemplateSpacing,
): string | undefined {
  const renderedArgs = args.map((arg) =>
    renderInlineNamedArgument(arg, spacing),
  );
  if (renderedArgs.some((arg) => arg === undefined)) return undefined;
  const rendered = renderedArgs.filter(
    (arg): arg is string => arg !== undefined,
  );
  return spacing === "compact"
    ? `{{${head}${rendered.join("")}}}`
    : `{{ ${head}${rendered.join("")} }}`;
}

interface InlineSyntaxWhitespace {
  outer: string[];
  parameterInternal: string[];
}

function horizontalWhitespaceBefore(source: string, index: number): string {
  let start = index;
  while (
    start > 0 &&
    (source[start - 1] === " " || source[start - 1] === "\t")
  ) {
    start--;
  }
  return source.slice(start, index);
}

function horizontalWhitespaceAfter(source: string, index: number): string {
  let end = index;
  while (end < source.length && (source[end] === " " || source[end] === "\t")) {
    end++;
  }
  return source.slice(index, end);
}

function collectInlineSyntaxWhitespace(
  node: TemplateNode,
  raw: string,
  args: readonly ParameterToken[],
): InlineSyntaxWhitespace | undefined {
  const nodeStart = node.getAbsoluteIndex();
  const parameterInternal: string[] = [];
  for (const arg of args) {
    const argStart = arg.getAbsoluteIndex() - nodeStart;
    const pipe = argStart - 1;
    const equals = argStart + arg.firstChild.toString().length;
    if (raw[pipe] !== "|" || raw[equals] !== "=") return undefined;
    parameterInternal.push(
      horizontalWhitespaceBefore(raw, pipe),
      horizontalWhitespaceAfter(raw, pipe + 1),
      horizontalWhitespaceBefore(raw, equals),
      horizontalWhitespaceAfter(raw, equals + 1),
    );
  }
  return {
    outer: [
      horizontalWhitespaceAfter(raw, 2),
      horizontalWhitespaceBefore(raw, raw.length - 2),
    ],
    parameterInternal,
  };
}

function whitespaceEditCount(
  whitespace: string,
  spacing: CanonicalInlineTemplateSpacing,
): number {
  if (spacing === "compact") return whitespace.length;
  if (whitespace.length === 0) return 1;
  return whitespace.includes(" ") ? whitespace.length - 1 : whitespace.length;
}

function inlineSyntaxWhitespaceCost(
  syntax: InlineSyntaxWhitespace,
  spacing: CanonicalInlineTemplateSpacing,
): { total: number; parameterInternal: number } {
  const outer = syntax.outer.reduce(
    (cost, whitespace) => cost + whitespaceEditCount(whitespace, spacing),
    0,
  );
  const parameterInternal =
    syntax.parameterInternal.reduce(
      (cost, whitespace) => cost + whitespaceEditCount(whitespace, spacing),
      0,
    ) * 2;
  return { total: outer + parameterInternal, parameterInternal };
}

function selectInlineNamedCandidate(
  node: TemplateNode,
  session: ParserSession,
  head: string,
  args: readonly ParameterToken[],
  requestedSpacing: InlineTemplateSpacing,
  lineWidth: number,
): { value?: string; reason?: string; multiline: false } {
  const raw = node.toString();
  const syntax = collectInlineSyntaxWhitespace(node, raw, args);
  if (!syntax) {
    return {
      reason: "parser did not expose stable inline template syntax boundaries",
      multiline: false,
    };
  }

  let originalFingerprint: string;
  try {
    originalFingerprint = templateTokenStructuralFingerprint(node);
  } catch {
    return {
      reason: "template candidate could not be structurally fingerprinted",
      multiline: false,
    };
  }

  const spacings: readonly CanonicalInlineTemplateSpacing[] =
    requestedSpacing === "auto"
      ? ["compact", "spaced"]
      : [requestedSpacing];
  const safeCandidates = spacings
    .map((spacing) => {
      const value = renderInlineTemplate(head, args, spacing);
      if (value === undefined) return undefined;
      try {
        if (value !== raw) {
          const reparsed = findOwningTemplate(value, session);
          if (
            !reparsed ||
            templateTokenStructuralFingerprint(reparsed) !== originalFingerprint
          ) {
            return undefined;
          }
        }
      } catch {
        return undefined;
      }
      return {
        spacing,
        value,
        length: value.length,
        cost: inlineSyntaxWhitespaceCost(syntax, spacing),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );

  if (requestedSpacing !== "auto") {
    const candidate = safeCandidates.find(
      ({ spacing }) => spacing === requestedSpacing,
    );
    return candidate
      ? candidate.length <= lineWidth
        ? { value: candidate.value, multiline: false }
        : { multiline: false }
      : {
          reason: `no structurally equivalent ${requestedSpacing} inline template candidate`,
          multiline: false,
        };
  }

  const candidate = safeCandidates
    .filter(({ length }) => length <= lineWidth)
    .sort(
      (left, right) =>
        left.cost.total - right.cost.total ||
        left.cost.parameterInternal - right.cost.parameterInternal ||
        (left.spacing === "compact" ? -1 : 1),
    )[0];
  return candidate
    ? { value: candidate.value, multiline: false }
    : safeCandidates.length === 0
      ? {
          reason: "no structurally equivalent inline template spacing candidate",
          multiline: false,
        }
      : { multiline: false };
}

// This bounds only the optional collapse of an existing multiline template
// that contains anonymous values. It is independent from named-template
// line-width decisions and protects byte-sensitive positional arguments.
const INLINE_ANONYMOUS_ARGUMENT_LIMIT = 3;

function anonymousLayoutCandidates(
  node: TemplateNode,
  collapseAnonymous: boolean,
): { candidates: string[]; reason?: string } {
  const invocation = stableTemplateInvocation(node);
  if ("reason" in invocation) {
    return { candidates: [], reason: invocation.reason };
  }
  const raw = invocation.normalizedRaw;
  const args = templateArguments(node);
  const start = node.getAbsoluteIndex();
  const firstArgStart = args[0]!.getAbsoluteIndex() - start;
  const head = trimAsciiLayoutWhitespace(raw.slice(2, firstArgStart - 1));
  const renderedArgs = args.map(renderAnonymousSafeArgument);
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

function findOwningTemplate(
  source: string,
  session: ParserSession,
): TemplateNode | undefined {
  const root = session.parse(source);
  if (root.toString() !== source) return undefined;
  return root
    .querySelectorAll<TemplateNode>("template")
    .find(
      (candidate) =>
        candidate.getAbsoluteIndex() === 0 && candidate.toString() === source,
    );
}

function protectEmbeddedParserTables(
  source: string,
  session: ParserSession,
): { text?: string; restore(value: string): string; reason?: string } {
  const context = session.createContext(source);
  const confirmed = collectParserTableCandidates(context)
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
  options: TemplateFormatOptions,
  session: ParserSession,
): { value?: string; reason?: string; multiline?: boolean } {
  const protectedTables = protectEmbeddedParserTables(raw, session);
  if (protectedTables.reason) return { reason: protectedTables.reason };
  const protectedNode = findOwningTemplate(
    protectedTables.text!,
    session,
  );
  if (!protectedNode) {
    return {
      reason: "parser did not expose an owning template around embedded tables",
    };
  }
  const rendered = renderTemplate(
    protectedNode,
    options,
    session,
    false,
    raw.includes("\n"),
  );
  if (rendered.reason || rendered.value === undefined) return rendered;
  const value = protectedTables.restore(rendered.value);
  try {
    if (
      !session.isRoundTripSafe(value) ||
      templateStructuralFingerprint(value, session) !==
        templateStructuralFingerprint(raw, session)
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
  collapseAnonymous: boolean,
  requireIdempotency: boolean,
  session: ParserSession,
): { value?: string; reason?: string; multiline?: boolean } {
  const raw = node.toString();
  const generated = anonymousLayoutCandidates(node, collapseAnonymous);
  if (generated.reason) return { reason: generated.reason };

  let originalFingerprint: string;
  try {
    originalFingerprint = templateStructuralFingerprint(raw, session);
  } catch {
    return { reason: "template candidate could not be structurally fingerprinted" };
  }

  for (const candidate of generated.candidates) {
    try {
      if (
        !session.isRoundTripSafe(candidate) ||
        templateStructuralFingerprint(candidate, session) !==
          originalFingerprint
      ) {
        continue;
      }
      if (requireIdempotency) {
        const reparsed = findOwningTemplate(candidate, session);
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
  options: TemplateFormatOptions,
  session: ParserSession,
  collapseAnonymous = true,
  originallyMultiline = false,
): { value?: string; reason?: string; multiline?: boolean } {
  const raw = node.toString();
  if (!raw.startsWith("{{") || !raw.endsWith("}}")) {
    return { reason: "parser node does not have balanced template delimiters" };
  }
  if (node.type === "magic-word") {
    classifyParserFunction(node.name);
    return { value: raw, multiline: raw.includes("\n") };
  }
  const invocation = stableTemplateInvocation(node);
  if ("reason" in invocation) return { reason: invocation.reason };
  if (isConfiguredMagicWordLikeTitle(invocation.title, session.config)) {
    return { value: raw, multiline: raw.includes("\n") };
  }
  const normalizedRaw = invocation.normalizedRaw;
  const args = templateArguments(node);
  if (args.length === 0) {
    return { value: normalizedRaw, multiline: normalizedRaw.includes("\n") };
  }
  if (potentialParserTableOpenerPositions(normalizedRaw).length > 0) {
    return renderTemplateWithOpaqueTables(
      normalizedRaw,
      options,
      session,
    );
  }

  const start = node.getAbsoluteIndex();
  const firstArgStart = args[0]!.getAbsoluteIndex() - start;
  const firstDelimiter = normalizedRaw[firstArgStart - 1];
  if (firstDelimiter !== "|" && firstDelimiter !== ":") {
    return { reason: "parser did not expose a stable first-argument delimiter" };
  }
  const head = trimAsciiLayoutWhitespace(
    normalizedRaw.slice(2, firstArgStart - 1),
  );
  if (!head) return { reason: "template name is empty" };

  if (args.some((arg) => arg.anon)) {
    return selectAnonymousLayoutCandidate(
      node,
      collapseAnonymous,
      true,
      session,
    );
  }

  const wasMultiline = originallyMultiline || raw.includes("\n");
  if (!wasMultiline) {
    const inline = selectInlineNamedCandidate(
      node,
      session,
      head,
      args,
      options.inlineTemplateSpacing,
      options.lineWidth,
    );
    if (inline.value !== undefined) return inline;
  }

  const renderedArgs = args.map((arg) =>
    renderMultilineNamedArgument(arg, options.parameterLayout),
  );
  if (renderedArgs.some((arg) => arg === undefined)) {
    return { reason: "parser exposed an empty named-parameter key" };
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
  context: ParsedDocumentContext,
  options: TemplateFormatOptions,
): TemplateFormatResult {
  const source = context.source;
  const diagnostics = emptyDiagnostics();
  const maxPasses = options.maxPasses ?? 64;
  let output = source;
  let firstContext: ParsedDocumentContext | undefined = context;
  const originalMultiline = new Map<string, boolean>();
  const changedNodeIds = new Set<string>();
  const expandedNodeIds = new Set<string>();
  const normalizedNodeIds = new Set<string>();
  const canonicalNodeValues = new Map<string, string>();
  const recordedSkipReasons = new Set<string>();

  const finalize = (formatted: string): TemplateFormatResult => {
    diagnostics.templatesChanged = changedNodeIds.size;
    diagnostics.uniqueTemplatesFormatted = changedNodeIds.size;
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
    diagnostics.changedTemplateSemanticIds = [...changedNodeIds];
    return { formatted, diagnostics };
  };

  if (maxPasses === 0) {
    const nodes = collectTemplateNodes(
      firstContext ?? context.session.createContext(output),
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
      firstContext ?? context.session.createContext(output);
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
      const raw = node.toString();
      if (canonicalNodeValues.get(semanticId) === raw) continue;
      const start = node.getAbsoluteIndex();
      const end = start + raw.length;
      if (changedAncestors.has(node)) continue;
      if (
        !raw.includes("\n") &&
        node.parentNode?.closest("table") &&
        hasTableSyntaxMagicWord(node)
      ) {
        canonicalNodeValues.set(semanticId, raw);
        continue;
      }
      const rendered = renderTemplate(node, options, context.session);
      if (rendered.reason) {
        const reasonIdentity = `${semanticId}\u0000${rendered.reason}`;
        if (!recordedSkipReasons.has(reasonIdentity)) {
          incrementReason(diagnostics, rendered.reason);
          recordedSkipReasons.add(reasonIdentity);
        }
        continue;
      }
      if (rendered.value === undefined || rendered.value === raw) {
        canonicalNodeValues.set(semanticId, raw);
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
  canonicalNodeValues.clear();
  recordedSkipReasons.clear();
  return finalize(source);
}

export function formatTemplates(
  context: ParsedDocumentContext,
  lineWidth: number,
): string {
  return formatTemplatesWithDiagnostics(
    context,
    {
      lineWidth,
      inlineTemplateSpacing: "auto",
      parameterLayout: "flush",
    },
  ).formatted;
}

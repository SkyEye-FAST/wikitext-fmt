import type { ResolvedFormatOptions } from "../options.js";
import {
  collectNodes,
  nodeRange,
  type ParsedDocumentContext,
  type ParserNodeLike,
  type SourceRange,
} from "../parserContext.js";

export type WikilinkSkipReason =
  | "file-link"
  | "category-assignment"
  | "interwiki-or-interlanguage"
  | "fragment-only"
  | "unstable-parser-target"
  | "unsafe-parent";

export interface WikilinkDiagnostics {
  wikilinksInspected: number;
  wikilinksEligible: number;
  wikilinksFormatted: number;
  underscoresReplaced: number;
  wikilinksWithFragmentsFormatted: number;
  wikilinksSkippedUnsafe: number;
  skipReasons: Partial<Record<WikilinkSkipReason, number>>;
}

export interface WikilinkFormatResult {
  formatted: string;
  diagnostics: WikilinkDiagnostics;
}

export interface WikilinkParserNode extends ParserNodeLike {
  type: string;
  interwiki?: string;
  parentNode?: WikilinkParserNode;
  childNodes: readonly WikilinkParserNode[];
}

export type WikilinkClassification =
  | {
      eligible: true;
      targetNode: WikilinkParserNode;
      target: string;
      fragmentIndex: number;
    }
  | {
      eligible: false;
      reason: WikilinkSkipReason;
    };

type WikilinkOptions = Pick<ResolvedFormatOptions, "interlanguagePrefixes">;

interface Replacement extends SourceRange {
  value: string;
}

const excludedParentTypes = new Set([
  "table",
  "ext",
  "html",
  "comment",
  "file",
  "category",
  "link",
  "ext-link",
]);

function emptyWikilinkDiagnostics(): WikilinkDiagnostics {
  return {
    wikilinksInspected: 0,
    wikilinksEligible: 0,
    wikilinksFormatted: 0,
    underscoresReplaced: 0,
    wikilinksWithFragmentsFormatted: 0,
    wikilinksSkippedUnsafe: 0,
    skipReasons: {},
  };
}

function skipReasonForParent(node: WikilinkParserNode): WikilinkSkipReason | undefined {
  let parent = node.parentNode;
  while (parent) {
    if (parent.type === "file") return "file-link";
    if (parent.type === "category") return "category-assignment";
    if (excludedParentTypes.has(parent.type)) return "unsafe-parent";
    parent = parent.parentNode;
  }
  return undefined;
}

function explicitInterlanguagePrefix(
  target: string,
  prefixes: readonly string[],
): boolean {
  const withoutLeadingColon = target.startsWith(":") ? target.slice(1) : target;
  const separator = withoutLeadingColon.indexOf(":");
  if (separator <= 0) return false;
  const prefix = withoutLeadingColon.slice(0, separator).toLocaleLowerCase();
  return prefixes.some(
    (candidate) => candidate.toLocaleLowerCase() === prefix,
  );
}

export function classifyWikilinkNode(
  node: WikilinkParserNode,
  options: WikilinkOptions,
): WikilinkClassification {
  if (node.type === "file") {
    return { eligible: false, reason: "file-link" };
  }
  if (node.type === "category") {
    return { eligible: false, reason: "category-assignment" };
  }
  if (node.type !== "link" && node.type !== "redirect-target") {
    return { eligible: false, reason: "unstable-parser-target" };
  }

  const parentReason = skipReasonForParent(node);
  if (parentReason) return { eligible: false, reason: parentReason };

  const targets = node.childNodes.filter((child) => child.type === "link-target");
  const targetNode = targets[0];
  if (
    targets.length !== 1 ||
    !targetNode ||
    targetNode.childNodes.some((child) => child.type !== "text")
  ) {
    return { eligible: false, reason: "unstable-parser-target" };
  }

  const target = targetNode.toString();
  if (
    (node.interwiki?.length ?? 0) > 0 ||
    explicitInterlanguagePrefix(target, options.interlanguagePrefixes)
  ) {
    return { eligible: false, reason: "interwiki-or-interlanguage" };
  }

  const fragmentIndex = target.indexOf("#");
  if (fragmentIndex === 0 || target.length === 0) {
    return { eligible: false, reason: "fragment-only" };
  }
  return { eligible: true, targetNode, target, fragmentIndex };
}

export function normalizeWikilinkPageTitleTarget(target: string): string {
  const fragmentIndex = target.indexOf("#");
  const titleEnd = fragmentIndex < 0 ? target.length : fragmentIndex;
  return (
    target.slice(0, titleEnd).replaceAll("_", " ") + target.slice(titleEnd)
  );
}

function countTitleUnderscores(target: string, fragmentIndex: number): number {
  const titleEnd = fragmentIndex < 0 ? target.length : fragmentIndex;
  let count = 0;
  for (let index = 0; index < titleEnd; index++) {
    if (target.charCodeAt(index) === 95) count++;
  }
  return count;
}

function recordSkip(
  diagnostics: WikilinkDiagnostics,
  reason: WikilinkSkipReason,
): void {
  diagnostics.wikilinksSkippedUnsafe++;
  diagnostics.skipReasons[reason] = (diagnostics.skipReasons[reason] ?? 0) + 1;
}

export function formatWikilinks(
  source: string,
  options: WikilinkOptions,
  context?: ParsedDocumentContext,
): WikilinkFormatResult {
  const diagnostics = emptyWikilinkDiagnostics();
  if (context?.source !== source) return { formatted: source, diagnostics };

  const nodes = collectNodes(
    context,
    "link, redirect-target, file, category",
  ) as WikilinkParserNode[];
  const replacements: Replacement[] = [];
  for (const node of nodes) {
    diagnostics.wikilinksInspected++;
    const classification = classifyWikilinkNode(node, options);
    if (!classification.eligible) {
      recordSkip(diagnostics, classification.reason);
      continue;
    }

    const nodeBounds = nodeRange(node);
    const targetBounds = nodeRange(classification.targetNode);
    if (
      targetBounds.start < nodeBounds.start ||
      targetBounds.end > nodeBounds.end ||
      source.slice(targetBounds.start, targetBounds.end) !== classification.target
    ) {
      recordSkip(diagnostics, "unstable-parser-target");
      continue;
    }

    diagnostics.wikilinksEligible++;
    const underscores = countTitleUnderscores(
      classification.target,
      classification.fragmentIndex,
    );
    if (underscores === 0) continue;

    replacements.push({
      ...targetBounds,
      value: normalizeWikilinkPageTitleTarget(classification.target),
    });
    diagnostics.wikilinksFormatted++;
    diagnostics.underscoresReplaced += underscores;
    if (classification.fragmentIndex >= 0) {
      diagnostics.wikilinksWithFragmentsFormatted++;
    }
  }

  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    output =
      output.slice(0, replacement.start) +
      replacement.value +
      output.slice(replacement.end);
  }
  return { formatted: output, diagnostics };
}

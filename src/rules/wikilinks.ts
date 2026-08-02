import type { ResolvedFormatOptions } from "../options.js";
import {
  collectNodes,
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

interface ClassifiedWikilink {
  node: WikilinkParserNode;
  classification: WikilinkClassification;
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

export function findWikilinkAncestorType(
  node: WikilinkParserNode,
  excludedTypes: ReadonlySet<string>,
): string | undefined {
  let parent = node.parentNode;
  while (parent) {
    if (excludedTypes.has(parent.type)) return parent.type;
    parent = parent.parentNode;
  }
  return undefined;
}

function skipReasonForParent(
  node: WikilinkParserNode,
): WikilinkSkipReason | undefined {
  const parentType = findWikilinkAncestorType(node, excludedParentTypes);
  if (parentType === "file") return "file-link";
  if (parentType === "category") return "category-assignment";
  return parentType === undefined ? undefined : "unsafe-parent";
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

export function wikilinkNodeSourceRanges(
  context: ParsedDocumentContext,
  requestedNodes: readonly WikilinkParserNode[],
): ReadonlyMap<WikilinkParserNode, SourceRange> {
  // getAbsoluteIndex() walks preceding siblings, which becomes quadratic for
  // link-heavy pages. Resolve relevant branches while scanning each serialized
  // parent once in source order.
  const requested = new Set(requestedNodes);
  const relevant = new Set<WikilinkParserNode>();
  for (const node of requested) {
    let current: WikilinkParserNode | undefined = node;
    while (current) {
      relevant.add(current);
      current = current.parentNode;
    }
  }

  const ranges = new Map<WikilinkParserNode, SourceRange>();
  const visit = (
    parent: WikilinkParserNode,
    parentStart: number,
    parentRaw: string,
  ): void => {
    let cursor = 0;
    for (const child of parent.childNodes) {
      const raw = child.toString();
      const relativeStart = parentRaw.indexOf(raw, cursor);
      if (relativeStart < 0) continue;
      const start = parentStart + relativeStart;
      const end = start + raw.length;
      if (requested.has(child)) ranges.set(child, { start, end });
      if (relevant.has(child)) visit(child, start, raw);
      cursor = relativeStart + raw.length;
    }
  };

  const root = context.root as unknown as WikilinkParserNode;
  if (root.toString() === context.source) {
    visit(root, 0, context.source);
  }
  return ranges;
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
    if (
      replacement.start < cursor ||
      replacement.end < replacement.start ||
      replacement.end > source.length
    ) {
      return source;
    }
    parts.push(source.slice(cursor, replacement.start), replacement.value);
    cursor = replacement.end;
  }
  parts.push(source.slice(cursor));
  return parts.join("");
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
  const classified: ClassifiedWikilink[] = nodes.map((node) => ({
    node,
    classification: classifyWikilinkNode(node, options),
  }));
  const ranges = wikilinkNodeSourceRanges(
    context,
    classified.flatMap(({ node, classification }) =>
      classification.eligible
        ? [node, classification.targetNode]
        : [],
    ),
  );
  const replacements: Replacement[] = [];
  for (const { node, classification } of classified) {
    diagnostics.wikilinksInspected++;
    if (!classification.eligible) {
      recordSkip(diagnostics, classification.reason);
      continue;
    }

    const nodeBounds = ranges.get(node);
    const targetBounds = ranges.get(classification.targetNode);
    if (
      !nodeBounds ||
      !targetBounds ||
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

  return { formatted: applyReplacements(source, replacements), diagnostics };
}

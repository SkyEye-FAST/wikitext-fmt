import type { ResolvedFormatOptions } from "../options.js";
import {
  collectNodes,
  collectNodeRanges,
  isRangeInside,
  isNodeWholeLine,
  lineIndexAt,
  lineRangeAt,
  nodeRange,
  type ParsedDocumentContext,
  type SourceRange,
} from "../parserContext.js";
import {
  behaviorSwitchIds,
  resolveLocalizationAliases,
  type BehaviorSwitchId,
} from "../localization/aliases.js";
import { hasFinalNewline, withFinalNewline } from "../utils/text.js";
import {
  findWikilinkAncestorType,
  wikilinkNodeSourceRanges,
  type WikilinkParserNode,
} from "./wikilinks.js";

export type InterlanguageLinkSkipReason =
  | "not-parser-confirmed"
  | "not-root-level"
  | "not-whole-line"
  | "labelled-link"
  | "leading-colon"
  | "generic-interwiki"
  | "unconfigured-prefix"
  | "unstable-target"
  | "unsafe-parent";

export interface FooterDiagnostics {
  behaviorSwitchesMoved: number;
  behaviorSwitchesFormatted: number;
  defaultsortMoved: number;
  categoriesMoved: number;
  localizedCategoryAliasesCanonicalized: number;
  localizedDefaultsortAliasesCanonicalized: number;
  localizedBehaviorSwitchesCanonicalized: number;
  interlanguageLinksInspected: number;
  interlanguageLinksEligible: number;
  interlanguageLinksSkipped: number;
  interlanguageLinksMoved: number;
  interlanguageLinksFormatted: number;
  interlanguageLinkSkipReasons: Partial<
    Record<InterlanguageLinkSkipReason, number>
  >;
}

export interface PageFooterResult {
  formatted: string;
  diagnostics: FooterDiagnostics;
}

interface FooterEntry {
  index: number;
  value: string;
  originalValue: string;
}

interface MetadataCandidate {
  index: number;
  line: string;
  trimmed: string;
  start: number;
  end: number;
  parserConfirmed?: boolean;
}

interface HtmlParserNode extends WikilinkParserNode {
  name?: string;
  closing?: boolean;
  selfClosing?: boolean;
}

const interlanguageUnsafeParentTypes = new Set([
  "template",
  "magic-word",
  "table",
  "ext",
  "html",
  "comment",
  "file",
  "category",
  "link",
  "ext-link",
]);

function behaviorAliasToken(alias: string): string {
  return /^(?:__.*__|＿＿.*＿＿)$/u.test(alias) ? alias : `__${alias}__`;
}

function behaviorLookup(
  aliases: ReturnType<typeof resolveLocalizationAliases>["behaviorSwitches"],
): Map<string, BehaviorSwitchId> {
  const candidates = new Map<string, BehaviorSwitchId | undefined>();
  for (const [id, values] of Object.entries(aliases) as Array<
    [BehaviorSwitchId, string[]]
  >) {
    for (const value of values) {
      const token = behaviorAliasToken(value);
      const previous = candidates.get(token);
      candidates.set(
        token,
        previous === undefined && !candidates.has(token)
          ? id
          : previous === id
            ? id
            : undefined,
      );
    }
  }
  return new Map(
    [...candidates].filter(
      (entry): entry is [string, BehaviorSwitchId] => entry[1] !== undefined,
    ),
  );
}

export function isStandaloneBehaviorSwitchLine(
  line: string,
  aliases?: Map<string, BehaviorSwitchId>,
): boolean {
  const trimmed = line.trimEnd();
  if (trimmed.length === 0 || line.trimStart() !== line) return false;
  if (aliases) return aliases.has(trimmed);
  return behaviorSwitchIds.some((id) => trimmed === `__${id.toUpperCase()}__`);
}

function templateRanges(
  context: ParsedDocumentContext,
): SourceRange[] {
  return collectNodeRanges(context, "template");
}

function parserCategoryLineIndexes(
  context: ParsedDocumentContext,
): Set<number> {
  const indexes = new Set<number>();
  for (const node of collectNodes(context, "category")) {
    if (!isNodeWholeLine(context, node)) continue;
    indexes.add(lineIndexAt(context, node.getAbsoluteIndex()));
  }
  return indexes;
}

function collectMetadataCandidates(
  lines: readonly string[],
  lineStarts: readonly number[],
  templateRanges: readonly SourceRange[],
  parserCategoryLines?: ReadonlySet<number>,
): MetadataCandidate[] {
  const candidates: MetadataCandidate[] = [];
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trimEnd();
    const start = lineStarts[index] ?? 0;
    const end = start + trimmed.length;
    if (isRangeInside(start, end, templateRanges)) continue;
    candidates.push({
      index,
      line,
      trimmed,
      start,
      end,
      ...(parserCategoryLines?.has(index) ? { parserConfirmed: true } : {}),
    });
  }
  return candidates;
}

function looksLikeCategoryLink(line: string): boolean {
  return /^\[\[[^:\]\n]+:/u.test(line.trimEnd());
}

function matchCategory(
  line: string,
  aliases: ReadonlySet<string>,
  canonicalEnglish: boolean,
): { value: string; canonicalized: boolean } | undefined {
  const match = /^\[\[([^:\]\n]+):([^\]\n|]+(?:\|[^\]\n]*)?)\]\][ \t]*$/u.exec(
    line,
  );
  if (
    !match?.[1] ||
    match[2] === undefined ||
    !aliases.has(match[1].replaceAll("_", " ").toLocaleLowerCase())
  ) {
    return undefined;
  }
  const namespace = canonicalEnglish ? "Category" : match[1];
  return {
    value: `[[${namespace}:${match[2]}]]`,
    canonicalized: canonicalEnglish && namespace !== match[1],
  };
}

function recordInterlanguageSkip(
  diagnostics: FooterDiagnostics,
  reason: InterlanguageLinkSkipReason,
  count = 1,
): void {
  diagnostics.interlanguageLinksSkipped += count;
  diagnostics.interlanguageLinkSkipReasons[reason] =
    (diagnostics.interlanguageLinkSkipReasons[reason] ?? 0) + count;
}

function htmlElementRanges(context: ParsedDocumentContext): SourceRange[] {
  const voidElements = new Set(
    context.session.config.html[2].map((name) => name.toLocaleLowerCase()),
  );
  const stack: Array<{ name: string; start: number }> = [];
  const ranges: SourceRange[] = [];
  const nodes = (collectNodes(context, "html") as HtmlParserNode[]).sort(
    (left, right) => left.getAbsoluteIndex() - right.getAbsoluteIndex(),
  );
  for (const node of nodes) {
    const name = node.name?.toLocaleLowerCase();
    if (!name || node.selfClosing || voidElements.has(name)) continue;
    const range = nodeRange(node);
    if (!node.closing) {
      stack.push({ name, start: range.start });
      continue;
    }
    let openerIndex = -1;
    for (let index = stack.length - 1; index >= 0; index--) {
      if (stack[index]?.name === name) {
        openerIndex = index;
        break;
      }
    }
    if (openerIndex < 0) continue;
    const opener = stack[openerIndex]!;
    stack.splice(openerIndex);
    ranges.push({ start: opener.start, end: range.end });
  }
  for (const opener of stack) {
    ranges.push({ start: opener.start, end: context.source.length });
  }
  return ranges;
}

function collectInterlanguageLinks(
  context: ParsedDocumentContext,
  source: string,
  lines: readonly string[],
  prefixes: ReadonlySet<string>,
  diagnostics: FooterDiagnostics,
): FooterEntry[] {
  const nodes = collectNodes(context, "link") as WikilinkParserNode[];
  const targetNodes = nodes.flatMap((node) =>
    node.childNodes.filter((child) => child.type === "link-target"),
  );
  const ranges = wikilinkNodeSourceRanges(context, [...nodes, ...targetNodes]);
  const htmlRanges = htmlElementRanges(context);
  const entries: FooterEntry[] = [];

  for (const node of nodes) {
    const targets = node.childNodes.filter(
      (child) => child.type === "link-target",
    );
    const targetNode = targets[0];
    const raw = node.toString();
    const looksInterlanguageLike =
      (node.interwiki?.length ?? 0) > 0 ||
      targets.some((target) => target.toString().includes(":")) ||
      /^\[\[:?[^\]\n]+:/u.test(raw);
    if (!looksInterlanguageLike) continue;
    diagnostics.interlanguageLinksInspected++;

    const unsafeParent = findWikilinkAncestorType(
      node,
      interlanguageUnsafeParentTypes,
    );
    if (unsafeParent !== undefined) {
      recordInterlanguageSkip(diagnostics, "unsafe-parent");
      continue;
    }
    if (node.childNodes.some((child) => child.type === "link-text")) {
      recordInterlanguageSkip(diagnostics, "labelled-link");
      continue;
    }
    if (
      targets.length !== 1 ||
      !targetNode ||
      targetNode.childNodes.some((child) => child.type !== "text")
    ) {
      recordInterlanguageSkip(diagnostics, "unstable-target");
      continue;
    }
    const target = targetNode.toString();
    if (target.startsWith(":")) {
      recordInterlanguageSkip(diagnostics, "leading-colon");
      continue;
    }
    const separator = target.indexOf(":");
    if (separator <= 0 || separator === target.length - 1) {
      recordInterlanguageSkip(diagnostics, "unstable-target");
      continue;
    }
    const nodeBounds = ranges.get(node);
    const targetBounds = ranges.get(targetNode);
    if (
      !nodeBounds ||
      !targetBounds ||
      targetBounds.start < nodeBounds.start ||
      targetBounds.end > nodeBounds.end ||
      source.slice(nodeBounds.start, nodeBounds.end) !== raw ||
      source.slice(targetBounds.start, targetBounds.end) !== target
    ) {
      recordInterlanguageSkip(diagnostics, "unstable-target");
      continue;
    }
    if (isRangeInside(nodeBounds.start, nodeBounds.end, htmlRanges)) {
      recordInterlanguageSkip(diagnostics, "unsafe-parent");
      continue;
    }
    if (node.parentNode?.type !== "root") {
      recordInterlanguageSkip(diagnostics, "not-root-level");
      continue;
    }
    const lineIndex = lineIndexAt(context, nodeBounds.start);
    const lineRange = lineRangeAt(context, lineIndex);
    const leading = source.slice(lineRange.start, nodeBounds.start);
    const trailing = source.slice(nodeBounds.end, lineRange.end);
    if (leading !== "" || !/^[ \t]*$/u.test(trailing)) {
      recordInterlanguageSkip(diagnostics, "not-whole-line");
      continue;
    }

    const prefix = target.slice(0, separator).toLocaleLowerCase();
    if (!prefixes.has(prefix)) {
      recordInterlanguageSkip(
        diagnostics,
        (node.interwiki?.length ?? 0) > 0
          ? "generic-interwiki"
          : "unconfigured-prefix",
      );
      continue;
    }
    if (
      !node.interwiki ||
      node.interwiki.toLocaleLowerCase() !== prefix
    ) {
      recordInterlanguageSkip(diagnostics, "not-parser-confirmed");
      continue;
    }

    diagnostics.interlanguageLinksEligible++;
    const line = lines[lineIndex];
    if (line === undefined) {
      recordInterlanguageSkip(diagnostics, "unstable-target");
      diagnostics.interlanguageLinksEligible--;
      continue;
    }
    if (line !== raw) diagnostics.interlanguageLinksFormatted++;
    entries.push({ index: lineIndex, value: raw, originalValue: raw });
  }
  return entries.sort((left, right) => left.index - right.index);
}

function staleInterlanguageCandidates(source: string): number {
  return source
    .split("\n")
    .filter((line) => /^\[\[:?[^\]\n]+:/u.test(line.trimEnd())).length;
}

function matchDefaultsort(
  line: string,
  aliases: readonly string[],
  canonicalEnglish: boolean,
): { value: string; canonicalized: boolean } | undefined {
  const trimmed = line.trimEnd();
  for (const alias of aliases) {
    const syntaxKeyword = /[:：]$/u.test(alias) ? alias : `${alias}:`;
    const prefix = `{{${syntaxKeyword}`;
    if (!trimmed.startsWith(prefix) || !trimmed.endsWith("}}")) continue;
    const value = trimmed.slice(prefix.length, -2);
    if (!value || /[{}\n]/u.test(value)) return undefined;
    const keyword = canonicalEnglish ? "DEFAULTSORT:" : syntaxKeyword;
    return {
      value: `{{${keyword}${value}}}`,
      canonicalized: canonicalEnglish && keyword !== syntaxKeyword,
    };
  }
  return undefined;
}

function countMoved(
  entries: readonly FooterEntry[],
  outputLines: readonly string[],
): number {
  let cursor = 0;
  let moved = 0;
  for (const entry of entries) {
    const outputIndex = outputLines.findIndex(
      (line, index) => index >= cursor && line === entry.value,
    );
    if (outputIndex < 0 || outputIndex !== entry.index) moved++;
    if (outputIndex >= 0) cursor = outputIndex + 1;
  }
  return moved;
}

export function formatPageFooter(
  context: ParsedDocumentContext,
  options: Pick<
    ResolvedFormatOptions,
    | "formatCategories"
    | "formatInterlanguageLinks"
    | "interlanguagePlacement"
    | "interlanguagePrefixes"
    | "formatBehaviorSwitches"
    | "behaviorSwitchPlacement"
    | "localizationSource"
    | "localizedSyntaxStyle"
    | "localizationAliases"
  >,
  sourceSnapshot: string = context.source,
): PageFooterResult {
  const source = sourceSnapshot;
  const diagnostics: FooterDiagnostics = {
    behaviorSwitchesMoved: 0,
    behaviorSwitchesFormatted: 0,
    defaultsortMoved: 0,
    categoriesMoved: 0,
    localizedCategoryAliasesCanonicalized: 0,
    localizedDefaultsortAliasesCanonicalized: 0,
    localizedBehaviorSwitchesCanonicalized: 0,
    interlanguageLinksInspected: 0,
    interlanguageLinksEligible: 0,
    interlanguageLinksSkipped: 0,
    interlanguageLinksMoved: 0,
    interlanguageLinksFormatted: 0,
    interlanguageLinkSkipReasons: {},
  };
  if (context.source !== source) {
    if (options.formatInterlanguageLinks) {
      const count = staleInterlanguageCandidates(source);
      diagnostics.interlanguageLinksInspected += count;
      recordInterlanguageSkip(diagnostics, "not-parser-confirmed", count);
    }
    return { formatted: source, diagnostics };
  }
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const aliases = resolveLocalizationAliases(
    options.localizationSource,
    options.localizationAliases,
  );
  const categoryAliases = new Set(
    aliases.categoryNamespaces.map((alias) =>
      alias.replaceAll("_", " ").toLocaleLowerCase(),
    ),
  );
  const switchAliases = behaviorLookup(aliases.behaviorSwitches);
  const interlanguagePrefixes = new Set(
    (options.interlanguagePrefixes ?? []).map((prefix) =>
      prefix.toLocaleLowerCase(),
    ),
  );
  const canonicalEnglish = options.localizedSyntaxStyle === "canonical-english";
  const ranges = templateRanges(context);
  const parserCategoryLines = parserCategoryLineIndexes(context);
  const lineStarts = context.lineStarts;
  const candidates = collectMetadataCandidates(
    lines,
    lineStarts,
    ranges,
    parserCategoryLines,
  );

  const categories: FooterEntry[] = [];
  const categoryIndexes = new Set<number>();
  if (options.formatCategories) {
    for (const candidate of candidates) {
      if (!candidate.parserConfirmed && !looksLikeCategoryLink(candidate.line))
        continue;
      // Parser-confirmed category lines cover aliases known to the active
      // parser config. They still must satisfy the formatter's current
      // localization alias policy; custom/siteinfo aliases that the parser does
      // not know continue through the line-level fallback.
      const value = matchCategory(
        candidate.line,
        categoryAliases,
        canonicalEnglish,
      );
      if (!value) continue;
      if (value.canonicalized)
        diagnostics.localizedCategoryAliasesCanonicalized++;
      categories.push({
        index: candidate.index,
        value: value.value,
        originalValue: candidate.trimmed,
      });
      categoryIndexes.add(candidate.index);
    }
  }

  const defaultsorts: FooterEntry[] = [];
  const defaultsortIndexes = new Set<number>();
  if (options.formatCategories) {
    for (const candidate of candidates) {
      const value = matchDefaultsort(
        candidate.line,
        aliases.defaultsortMagicWords,
        canonicalEnglish,
      );
      if (!value) continue;
      if (value.canonicalized)
        diagnostics.localizedDefaultsortAliasesCanonicalized++;
      defaultsorts.push({
        index: candidate.index,
        value: value.value,
        originalValue: candidate.trimmed,
      });
      defaultsortIndexes.add(candidate.index);
    }
  }

  const behaviorSwitches: FooterEntry[] = [];
  const behaviorSwitchIndexes = new Set<number>();
  if (options.formatBehaviorSwitches) {
    for (const candidate of candidates) {
      const originalValue = candidate.trimmed;
      const id = switchAliases.get(originalValue);
      if (!id) continue;
      const value = canonicalEnglish
        ? `__${id.toUpperCase()}__`
        : originalValue;
      if (value !== candidate.line) diagnostics.behaviorSwitchesFormatted++;
      if (canonicalEnglish && value !== originalValue)
        diagnostics.localizedBehaviorSwitchesCanonicalized++;
      behaviorSwitches.push({ index: candidate.index, value, originalValue });
      behaviorSwitchIndexes.add(candidate.index);
    }
  }

  const interlanguageLinks: FooterEntry[] = [];
  const interlanguageIndexes = new Set<number>();
  if (options.formatInterlanguageLinks) {
    interlanguageLinks.push(
      ...collectInterlanguageLinks(
        context,
        source,
        lines,
        interlanguagePrefixes,
        diagnostics,
      ),
    );
    for (const entry of interlanguageLinks) {
      interlanguageIndexes.add(entry.index);
    }
  }

  if (
    categories.length === 0 &&
    defaultsorts.length === 0 &&
    (options.interlanguagePlacement === "preserve" ||
      interlanguageLinks.length === 0) &&
    options.behaviorSwitchPlacement === "preserve"
  ) {
    for (const entry of behaviorSwitches) lines[entry.index] = entry.value;
    if (options.interlanguagePlacement === "preserve") {
      for (const entry of interlanguageLinks) lines[entry.index] = entry.value;
    }
    return {
      formatted: withFinalNewline(lines.join("\n"), finalNewline),
      diagnostics,
    };
  }

  const movedBehaviorSwitches =
    options.behaviorSwitchPlacement === "footer"
      ? behaviorSwitches.filter(
          (entry, index, entries) =>
            entries.findIndex(
              ({ originalValue, value }) =>
                (canonicalEnglish ? value : originalValue) ===
                (canonicalEnglish ? entry.value : entry.originalValue),
            ) === index,
        )
      : [];
  const removedIndexes = new Set([...categoryIndexes, ...defaultsortIndexes]);
  if (options.interlanguagePlacement === "footer") {
    for (const index of interlanguageIndexes) removedIndexes.add(index);
  }
  if (options.behaviorSwitchPlacement === "footer") {
    for (const index of behaviorSwitchIndexes) removedIndexes.add(index);
  }

  const bodyLines = lines.filter((_, index) => !removedIndexes.has(index));
  if (options.behaviorSwitchPlacement === "preserve") {
    for (const entry of behaviorSwitches) {
      const removedBefore = [...removedIndexes].filter(
        (index) => index < entry.index,
      ).length;
      bodyLines[entry.index - removedBefore] = entry.value;
    }
  }
  if (options.interlanguagePlacement === "preserve") {
    for (const entry of interlanguageLinks) {
      const removedBefore = [...removedIndexes].filter(
        (index) => index < entry.index,
      ).length;
      bodyLines[entry.index - removedBefore] = entry.value;
    }
  }
  const body = bodyLines
    .join("\n")
    .replace(/^(?:[ \t]*\n)+/u, "")
    .trimEnd();
  const groups: string[] = [];
  if (body) groups.push(body);
  if (movedBehaviorSwitches.length > 0)
    groups.push(movedBehaviorSwitches.map(({ value }) => value).join("\n"));
  const metadata = [...defaultsorts, ...categories]
    .map(({ value }) => value)
    .join("\n");
  if (metadata) groups.push(metadata);
  if (
    options.interlanguagePlacement === "footer" &&
    interlanguageLinks.length > 0
  ) {
    groups.push(interlanguageLinks.map(({ value }) => value).join("\n"));
  }
  const formatted = withFinalNewline(groups.join("\n\n"), finalNewline);
  const outputLines = formatted.split("\n");

  if (options.behaviorSwitchPlacement === "footer") {
    diagnostics.behaviorSwitchesMoved = countMoved(
      behaviorSwitches,
      outputLines,
    );
  }
  diagnostics.defaultsortMoved = countMoved(defaultsorts, outputLines);
  diagnostics.categoriesMoved = countMoved(categories, outputLines);
  if (options.interlanguagePlacement === "footer") {
    diagnostics.interlanguageLinksMoved = countMoved(
      interlanguageLinks,
      outputLines,
    );
  }
  return { formatted, diagnostics };
}

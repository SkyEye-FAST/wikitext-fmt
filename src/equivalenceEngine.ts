import type { ParameterToken, TranscludeToken } from "wikiparser-node";

import { normalizeSourceLineEndings } from "./lineEndings.js";
import type { ResolvedFormatOptions } from "./options.js";
import type { ParserSession } from "./parserRuntime.js";
import { normalizeBlankLines } from "./rules/blankLines.js";
import { formatPageFooter } from "./rules/categories.js";
import { formatExternalLinks } from "./rules/externalLinks.js";
import { formatFileLinks } from "./rules/fileLinks.js";
import { formatHeadings } from "./rules/headings.js";
import { formatHtmlVoidTags } from "./rules/htmlVoidTags.js";
import { canonicalizeListLayout } from "./rules/lists.js";
import { formatRedirects } from "./rules/redirects.js";
import { formatReferences } from "./rules/references.js";
import { formatSectionSpacing } from "./rules/sectionSpacing.js";
import {
  collectParserTableCandidates,
  type ParserTableNode,
} from "./rules/tables.js";
import {
  classifyWikilinkNode,
  normalizeWikilinkPageTitleTarget,
  type WikilinkParserNode,
} from "./rules/wikilinks.js";
import { outermostSourceRanges } from "./semanticIdentity.js";
import { protectBlocks } from "./utils/protectBlocks.js";

export type StructuralEquivalenceKind = "templates" | "tables" | "document";

export interface StructuralEquivalenceResult {
  equivalent: boolean;
  structure: StructuralEquivalenceKind;
  reason?: string;
}

type TransclusionNode = TranscludeToken & {
  type: string;
  parentNode?: GenericNode;
  getAbsoluteIndex(): number;
  toString(): string;
  querySelectorAll<T = GenericNode>(selector: string): T[];
};

interface GenericNode {
  type: string;
  name?: string;
  interwiki?: string;
  parentNode?: GenericNode;
  childNodes: readonly GenericNode[];
  getAbsoluteIndex(): number;
  toString(): string;
  querySelectorAll<T = GenericNode>(selector: string): T[];
}

type WikilinkTargetNormalizer = (node: GenericNode, target: string) => string;

export interface DocumentFingerprint {
  templates: unknown;
  tables: unknown;
  links: unknown[];
  files: unknown[];
  externalLinks: unknown[];
  references: unknown[];
  categories: unknown[];
  defaultsort: unknown[];
  redirects: unknown[];
  headings: unknown[];
  behaviorSwitches: unknown[];
  interlanguageLinks: unknown[];
  extensions: unknown[];
  html: unknown[];
  comments: unknown[];
  prose: string;
}

interface TemplateFingerprint {
  type: string;
  name: string | TemplateValuePart[];
  parent: number | null;
  parameters: Array<{
    anon: boolean;
    name: string;
    value: string | TemplateValuePart[];
  }>;
}

type TemplateValuePart =
  | string
  | { kind: "template"; value: Omit<TemplateFingerprint, "parent"> }
  | { kind: "structure"; type: string; value: unknown };

function collectTransclusions(
  source: string,
  session: ParserSession,
): TransclusionNode[] {
  const root = session.createContext(source).root;
  return root
    .querySelectorAll<TransclusionNode>("template, magic-word")
    .sort((a, b) => a.getAbsoluteIndex() - b.getAbsoluteIndex());
}

function nearestTransclusion(
  node: GenericNode | undefined,
): TransclusionNode | undefined {
  let current = node;
  while (current) {
    if (current.type === "template" || current.type === "magic-word") {
      return current as TransclusionNode;
    }
    current = current.parentNode;
  }
  return undefined;
}

function semanticTransclusionValue(
  valueNode: GenericNode,
  owner: TransclusionNode,
  trim: boolean,
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): string | TemplateValuePart[] {
  const base = valueNode.getAbsoluteIndex();
  const raw = valueNode.toString();
  const content = trim ? raw.trim() : raw;
  const contentStart = trim ? raw.indexOf(content) : 0;
  const contentEnd = contentStart + content.length;
  const nested = valueNode
    .querySelectorAll<TransclusionNode>("template, magic-word")
    .filter((node) => nearestTransclusion(node.parentNode) === owner)
    .map((node) => ({
      start: node.getAbsoluteIndex() - base,
      end: node.getAbsoluteIndex() - base + node.toString().length,
      part: {
        kind: "template" as const,
        value: templateNodeFingerprint(node, normalizeWikilinkTarget),
      },
    }))
    .filter(
      (replacement) =>
        replacement.start >= contentStart && replacement.end <= contentEnd,
    )
    .sort((a, b) => a.start - b.start);
  const semanticStructure = (node: GenericNode): unknown => {
    switch (node.type) {
      case "file":
        return semanticFile(node);
      case "category":
        return {
          target: node.name ?? childText(node, "link-target"),
          sortKey: semanticChildText(node, "link-text"),
        };
      case "link":
        return {
          target: semanticWikilinkTarget(node, normalizeWikilinkTarget),
          label: semanticChildText(node, "link-text"),
        };
      case "ext-link":
        return {
          url: childText(node, "ext-link-url"),
          label: semanticChildText(node, "ext-link-text", "leading"),
        };
      case "ext":
        return semanticExtension(node);
      case "html":
        return semanticHtml(node);
      default:
        return node.toString();
    }
  };
  const structured = valueNode
    .querySelectorAll<GenericNode>(
      "file, category, link, ext-link, ext, html, comment",
    )
    .filter((node) => nearestTransclusion(node.parentNode) === owner)
    .map((node) => ({
      start: node.getAbsoluteIndex() - base,
      end: node.getAbsoluteIndex() - base + node.toString().length,
      part: {
        kind: "structure" as const,
        type: node.type,
        value: semanticStructure(node),
      },
    }));
  const replacements = outermostSourceRanges([...nested, ...structured])
    .filter(
      (replacement) =>
        replacement.start >= contentStart && replacement.end <= contentEnd,
    )
    .sort((a, b) => a.start - b.start);
  if (replacements.length === 0) return canonicalizeListLayout(content);
  const parts: TemplateValuePart[] = [];
  let cursor = contentStart;
  for (const replacement of replacements) {
    if (replacement.start > cursor) {
      parts.push(canonicalizeListLayout(raw.slice(cursor, replacement.start)));
    }
    parts.push(replacement.part);
    cursor = replacement.end;
  }
  if (cursor < contentEnd) {
    parts.push(canonicalizeListLayout(raw.slice(cursor, contentEnd)));
  }
  return parts;
}

function semanticTemplateInvocationName(
  node: TransclusionNode,
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): string | TemplateValuePart[] {
  if (node.type !== "template") return node.name;
  const title = node.firstChild as unknown as GenericNode;
  if (
    title.type === "template-name" &&
    title.childNodes.every((child) => child.type === "text")
  ) {
    return node.name;
  }

  const base = title.getAbsoluteIndex();
  const raw = title.toString();
  const nested = title
    .querySelectorAll<TransclusionNode>("template, magic-word")
    .filter((candidate) => nearestTransclusion(candidate.parentNode) === node)
    .map((candidate) => ({
      start: candidate.getAbsoluteIndex() - base,
      end: candidate.getAbsoluteIndex() - base + candidate.toString().length,
      part: {
        kind: "template" as const,
        value: templateNodeFingerprint(candidate, normalizeWikilinkTarget),
      },
    }))
    .filter(
      (replacement) => replacement.start >= 0 && replacement.end <= raw.length,
    )
    .sort((a, b) => a.start - b.start);
  if (nested.length === 0) return raw;

  const parts: TemplateValuePart[] = [];
  let cursor = 0;
  for (const replacement of nested) {
    if (replacement.start > cursor) {
      parts.push(raw.slice(cursor, replacement.start));
    }
    parts.push(replacement.part);
    cursor = replacement.end;
  }
  if (cursor < raw.length) parts.push(raw.slice(cursor));
  return parts;
}

function templateNodeFingerprint(
  node: TransclusionNode,
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): Omit<TemplateFingerprint, "parent"> {
  return {
    type: node.type,
    name: semanticTemplateInvocationName(node, normalizeWikilinkTarget),
    parameters: node.childNodes
      .filter((child): child is ParameterToken => child.type === "parameter")
      .map((arg) => ({
        anon: arg.anon,
        name: arg.anon ? arg.name : arg.name.trim(),
        value: semanticTransclusionValue(
          arg.lastChild as unknown as GenericNode,
          node,
          !arg.anon,
          normalizeWikilinkTarget,
        ),
      })),
  };
}

export function templateTokenStructuralFingerprint(
  node: TranscludeToken,
): string {
  return JSON.stringify(templateNodeFingerprint(node as TransclusionNode));
}

function outermostParserConfirmedTables(
  source: string,
  session: ParserSession,
) {
  const context = session.createContext(source);
  return collectParserTableCandidates(context)
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter(
      (candidate, index, all) =>
        !all
          .slice(0, index)
          .some(
            (outer) =>
              outer.start <= candidate.start && outer.end >= candidate.end,
          ),
    );
}

function maskParserConfirmedTables(
  source: string,
  candidates: ReturnType<typeof outermostParserConfirmedTables>,
): string {
  let masked = source;
  for (let index = candidates.length - 1; index >= 0; index--) {
    const candidate = candidates[index]!;
    masked =
      masked.slice(0, candidate.start) +
      `\uE200wikitext-fmt-table-${index}\uE201` +
      masked.slice(candidate.end);
  }
  return masked;
}

function templatesInsideParserConfirmedTables(
  candidates: ReturnType<typeof outermostParserConfirmedTables>,
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): TemplateFingerprint[][] {
  return candidates.map((candidate) => {
    const nodes = [
      ...candidate.node.querySelectorAll<TransclusionNode>("template"),
      ...candidate.node.querySelectorAll<TransclusionNode>("magic-word"),
    ].sort((a, b) => a.getAbsoluteIndex() - b.getAbsoluteIndex());
    const indices = new Map(nodes.map((node, index) => [node, index]));
    return nodes.map((node) => {
      const parent = nearestTransclusion(node.parentNode);
      return {
        ...templateNodeFingerprint(node, normalizeWikilinkTarget),
        parent: parent ? (indices.get(parent) ?? null) : null,
      };
    });
  });
}

function templateStructuralFingerprintWithNormalizer(
  source: string,
  session: ParserSession,
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): string {
  const hasTableOpener = source.includes("{|");
  const tables = hasTableOpener
    ? outermostParserConfirmedTables(source, session)
    : [];
  const nodes = collectTransclusions(
    hasTableOpener ? maskParserConfirmedTables(source, tables) : source,
    session,
  );
  const indices = new Map(nodes.map((node, index) => [node, index]));
  const fingerprint: TemplateFingerprint[] = nodes.map((node) => {
    const parent = nearestTransclusion(node.parentNode);
    return {
      ...templateNodeFingerprint(node, normalizeWikilinkTarget),
      parent: parent ? (indices.get(parent) ?? null) : null,
    };
  });
  return JSON.stringify({
    templates: fingerprint,
    templatesInsideTables: templatesInsideParserConfirmedTables(
      tables,
      normalizeWikilinkTarget,
    ),
  });
}

export function templateStructuralFingerprint(
  source: string,
  session: ParserSession,
): string {
  return templateStructuralFingerprintWithNormalizer(source, session);
}

interface TableCellFingerprint {
  subtype: string;
  attributes: string;
  content: string | TableContentPart[];
}

type TableContentPart =
  | string
  | { kind: "table"; value: Omit<TableFingerprint, "parent"> }
  | { kind: "template"; value: Omit<TemplateFingerprint, "parent"> };

interface TableFingerprint {
  parent: number | null;
  attributes: string;
  captions: TableCellFingerprint[];
  rows: Array<{
    attributes: string;
    cells: TableCellFingerprint[];
  }>;
}

function closestTable(
  node: ParserTableNode | undefined,
): ParserTableNode | undefined {
  let current = node;
  while (current && current.type !== "table") current = current.parentNode;
  return current;
}

function semanticTableCellContent(
  cell: ParserTableNode,
  owner: ParserTableNode,
): string | TableContentPart[] {
  const inner = cell.childNodes[2];
  if (!inner) return "";
  let output = inner.toString();
  const directNestedTables = inner
    .querySelectorAll<ParserTableNode>("table")
    .filter((table) => closestTable(table.parentNode) === owner);
  const directNestedTransclusions = [
    ...inner.querySelectorAll<TransclusionNode>("template"),
    ...inner.querySelectorAll<TransclusionNode>("magic-word"),
  ].filter((node) => nearestTransclusion(node.parentNode) === undefined);
  if (
    directNestedTables.length === 0 &&
    directNestedTransclusions.length === 0
  ) {
    return output;
  }
  let tableCursor = 0;
  const nestedTables = directNestedTables
    .map((table) => {
      const raw = table.toString();
      const start = output.indexOf(raw, tableCursor);
      if (start < 0) return undefined;
      tableCursor = start + raw.length;
      return {
        start,
        end: start + raw.length,
        value: tableNodeFingerprint(table),
      };
    })
    .filter(
      (replacement): replacement is NonNullable<typeof replacement> =>
        replacement !== undefined,
    )
    .map((replacement) => ({ ...replacement, kind: "table" as const }));
  let templateCursor = 0;
  const nestedTransclusions = directNestedTransclusions
    .map((node) => {
      const raw = node.toString();
      const start = output.indexOf(raw, templateCursor);
      if (start < 0) return undefined;
      templateCursor = start + raw.length;
      return {
        start,
        end: start + raw.length,
        value: templateNodeFingerprint(node),
        kind: "template" as const,
      };
    })
    .filter(
      (replacement): replacement is NonNullable<typeof replacement> =>
        replacement !== undefined,
    )
    .filter(
      (replacement) =>
        !nestedTables.some(
          (table) =>
            table.start <= replacement.start && table.end >= replacement.end,
        ),
    );
  const nested = [...nestedTables, ...nestedTransclusions].sort(
    (a, b) => a.start - b.start,
  );
  if (nested.length === 0) return output;
  const parts: TableContentPart[] = [];
  let cursor = 0;
  for (const replacement of nested) {
    if (replacement.start > cursor) {
      parts.push(output.slice(cursor, replacement.start));
    }
    if (replacement.kind === "table") {
      parts.push({ kind: "table", value: replacement.value });
    } else {
      parts.push({ kind: "template", value: replacement.value });
    }
    cursor = replacement.end;
  }
  if (cursor < output.length) parts.push(output.slice(cursor));
  return parts;
}

function removeTableCellLayoutPrefix(
  content: string | TableContentPart[],
): string | TableContentPart[] {
  if (typeof content === "string") {
    return content.startsWith(" ") ? content.slice(1) : content;
  }
  const [first, ...rest] = content;
  if (typeof first !== "string" || !first.startsWith(" ")) return content;
  const normalized = first.slice(1);
  return normalized ? [normalized, ...rest] : rest;
}

function removeTableAttributeLayoutSpaces(attributes: string): string {
  const withoutLeading = attributes.startsWith(" ")
    ? attributes.slice(1)
    : attributes;
  return withoutLeading.endsWith(" ")
    ? withoutLeading.slice(0, -1)
    : withoutLeading;
}

function cellFingerprint(
  cell: ParserTableNode & { subtype?: string },
  owner: ParserTableNode,
): TableCellFingerprint {
  const layoutAware = cell.subtype !== "caption";
  return {
    subtype: cell.subtype ?? "td",
    attributes: layoutAware
      ? removeTableAttributeLayoutSpaces(cell.childNodes[1]?.toString() ?? "")
      : (cell.childNodes[1]?.toString() ?? ""),
    content: layoutAware
      ? removeTableCellLayoutPrefix(semanticTableCellContent(cell, owner))
      : semanticTableCellContent(cell, owner),
  };
}

function directCells(
  parent: ParserTableNode,
  owner: ParserTableNode,
): Array<ParserTableNode & { subtype?: string }> {
  return parent.childNodes.filter(
    (node): node is ParserTableNode & { subtype?: string } =>
      node.type === "td" && closestTable(node.parentNode) === owner,
  );
}

function tableNodeFingerprint(
  table: ParserTableNode,
): Omit<TableFingerprint, "parent"> {
  const direct = directCells(table, table);
  const captions = direct
    .filter((cell) => cell.subtype === "caption")
    .map((cell) => cellFingerprint(cell, table));
  const rows: TableFingerprint["rows"] = [];
  const implicit = direct.filter((cell) => cell.subtype !== "caption");
  if (implicit.length > 0) {
    rows.push({
      attributes: "",
      cells: implicit.map((cell) => cellFingerprint(cell, table)),
    });
  }
  for (const row of table.childNodes.filter((node) => node.type === "tr")) {
    rows.push({
      attributes: row.childNodes[1]?.toString() ?? "",
      cells: directCells(row, table).map((cell) =>
        cellFingerprint(cell, table),
      ),
    });
  }
  return {
    attributes: table.childNodes[1]?.toString() ?? "",
    captions,
    rows,
  };
}

export function tableStructuralFingerprint(
  source: string,
  session: ParserSession,
): string {
  const context = session.createContext(source);
  const candidates = collectParserTableCandidates(context);
  const fingerprint: TableFingerprint[] = candidates.map((candidate, index) => {
    let parent = -1;
    for (
      let possibleIndex = 0;
      possibleIndex < candidates.length;
      possibleIndex++
    ) {
      const possible = candidates[possibleIndex]!;
      if (
        possibleIndex !== index &&
        possible.start < candidate.start &&
        possible.end > candidate.end
      ) {
        parent = possibleIndex;
      }
    }
    return {
      ...tableNodeFingerprint(candidate.node),
      parent: parent < 0 ? null : parent,
    };
  });
  return JSON.stringify(fingerprint);
}

function childText(node: GenericNode, type: string): string | null {
  return (
    node.childNodes.find((child) => child.type === type)?.toString() ?? null
  );
}

function semanticWikilinkTarget(
  node: GenericNode,
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): string | null {
  const target = childText(node, "link-target");
  return target === null || !normalizeWikilinkTarget
    ? target
    : normalizeWikilinkTarget(node, target);
}

function semanticRedirectTarget(
  node: GenericNode,
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): string | null {
  const target = node.querySelectorAll<GenericNode>("redirect-target").at(0);
  return target
    ? semanticWikilinkTarget(target, normalizeWikilinkTarget)
    : null;
}

function isDirectTransclusionWithin(
  node: TransclusionNode,
  boundary: GenericNode,
): boolean {
  let parent = node.parentNode;
  while (parent && parent !== boundary) {
    if (parent.type === "template" || parent.type === "magic-word") {
      return false;
    }
    parent = parent.parentNode;
  }
  return parent === boundary;
}

function semanticNodeText(
  node: GenericNode,
  trim: "none" | "leading" | "both" = "none",
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): string | TemplateValuePart[] {
  const raw = node.toString();
  const contentStart =
    trim === "none" ? 0 : (/^[ \t]*/u.exec(raw)?.[0].length ?? 0);
  const contentEnd =
    trim === "both"
      ? raw.length - (/[ \t]*$/u.exec(raw)?.[0].length ?? 0)
      : raw.length;
  const nested = node
    .querySelectorAll<TransclusionNode>("template, magic-word")
    .filter((candidate) => isDirectTransclusionWithin(candidate, node))
    .map((candidate) => ({
      start: candidate.getAbsoluteIndex() - node.getAbsoluteIndex(),
      end:
        candidate.getAbsoluteIndex() -
        node.getAbsoluteIndex() +
        candidate.toString().length,
      part: {
        kind: "template" as const,
        value: templateNodeFingerprint(candidate, normalizeWikilinkTarget),
      },
    }))
    .filter(
      (replacement) =>
        replacement.start >= contentStart && replacement.end <= contentEnd,
    )
    .sort((a, b) => a.start - b.start);
  const wikilinks = normalizeWikilinkTarget
    ? node.querySelectorAll<GenericNode>("link").map((candidate) => ({
        start: candidate.getAbsoluteIndex() - node.getAbsoluteIndex(),
        end:
          candidate.getAbsoluteIndex() -
          node.getAbsoluteIndex() +
          candidate.toString().length,
        part: {
          kind: "structure" as const,
          type: "link",
          value: {
            target: semanticWikilinkTarget(candidate, normalizeWikilinkTarget),
            label: semanticChildText(candidate, "link-text"),
          },
        },
      }))
    : [];
  const replacements = outermostSourceRanges([...nested, ...wikilinks])
    .filter(
      (replacement) =>
        replacement.start >= contentStart && replacement.end <= contentEnd,
    )
    .sort((a, b) => a.start - b.start);
  if (replacements.length === 0) return raw.slice(contentStart, contentEnd);
  const parts: TemplateValuePart[] = [];
  let cursor = contentStart;
  for (const replacement of replacements) {
    if (replacement.start > cursor) {
      parts.push(raw.slice(cursor, replacement.start));
    }
    parts.push(replacement.part);
    cursor = replacement.end;
  }
  if (cursor < contentEnd) parts.push(raw.slice(cursor, contentEnd));
  return parts;
}

function semanticChildText(
  node: GenericNode,
  type: string,
  trim: "none" | "leading" | "both" = "none",
  normalizeWikilinkTarget?: WikilinkTargetNormalizer,
): string | TemplateValuePart[] | null {
  const child = node.childNodes.find((candidate) => candidate.type === type);
  return child ? semanticNodeText(child, trim, normalizeWikilinkTarget) : null;
}

function isInside(node: GenericNode, types: ReadonlySet<string>): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (types.has(parent.type)) return true;
    parent = parent.parentNode;
  }
  return false;
}

function semanticFile(node: GenericNode): unknown {
  return {
    target: node.name ?? childText(node, "link-target"),
    options: node.childNodes
      .filter((child) => child.type === "image-parameter")
      .map((option) => ({
        kind: option.name ?? "caption",
        value: semanticNodeText(option),
      })),
  };
}

function semanticExtension(node: GenericNode): unknown {
  return {
    name: node.name?.toLowerCase() ?? "",
    attributes: node
      .querySelectorAll<GenericNode>("ext-attr")
      .map((attribute) => attribute.toString()),
    content: childText(node, "ext-inner"),
  };
}

function semanticHtml(node: GenericNode): unknown {
  const name = node.name?.toLowerCase() ?? "";
  if (name === "br" || name === "hr" || name === "wbr") {
    return {
      name,
      attributes: node
        .querySelectorAll<GenericNode>("html-attr")
        .map((attribute) => attribute.toString()),
    };
  }
  return semanticNodeText(node);
}

function structuralNodes(root: GenericNode, selector: string): GenericNode[] {
  return [...root.querySelectorAll<GenericNode>(selector)];
}

function lineBounds(
  source: string,
  node: GenericNode,
  knownStart?: number,
  knownEnd?: number,
): {
  start: number;
  end: number;
  wholeLine: boolean;
} {
  const start = knownStart ?? node.getAbsoluteIndex();
  const end = knownEnd ?? start + node.toString().length;
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const newline = source.indexOf("\n", end);
  const lineEnd = newline < 0 ? source.length : newline + 1;
  return {
    start: lineStart,
    end: lineEnd,
    wholeLine:
      source.slice(lineStart, start).trim() === "" &&
      source.slice(end, newline < 0 ? source.length : newline).trim() === "",
  };
}

function normalizeSectionSpacingSkeleton(source: string): string {
  const lines = source.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    if (!/^⟪heading:\d+⟫$/u.test(lines[index]!)) continue;
    while (index > 1 && lines[index - 1] === "" && lines[index - 2] === "") {
      lines.splice(index - 1, 1);
      index--;
    }
    if (index > 0 && lines[index - 1] !== "") {
      lines.splice(index, 0, "");
      index++;
    }
    if (index + 1 < lines.length && lines[index + 1] !== "") {
      lines.splice(index + 1, 0, "");
    }
  }
  return lines.join("\n");
}

function canonicalizeDocumentSyntax(
  source: string,
  options: ResolvedFormatOptions,
  session: ParserSession,
): string {
  let output = source;
  if (options.formatReferences) {
    const blocks = protectBlocks(output, {
      protectTables: true,
      protectReferenceTags: false,
    });
    output = blocks.restore(
      formatReferences(
        blocks.text,
        session.createContext(blocks.text),
      ).formatted,
    );
  }
  const protectedText = protectBlocks(output, { protectTables: true });
  output = protectedText.text;
  if (options.formatHeadings) output = formatHeadings(output);
  if (options.formatRedirects) {
    output = formatRedirects(
      output,
      {
        localizationSource: options.localizationSource,
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: options.localizationAliases,
      },
      session.createContext(output),
    ).formatted;
  }
  if (options.formatFileLinks) {
    output = formatFileLinks(
      output,
      {
        localizationSource: options.localizationSource,
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: options.localizationAliases,
      },
      session.createContext(output),
    ).formatted;
  }
  if (options.formatExternalLinks) {
    output = formatExternalLinks(
      output,
      session.createContext(output),
    ).formatted;
  }
  if (options.formatSectionSpacing) {
    output = formatSectionSpacing(
      output,
      session.createContext(output),
    ).formatted;
  }
  if (options.normalizeBlankLines) output = normalizeBlankLines(output);
  output = formatHtmlVoidTags(output, options.htmlVoidTagStyle);
  if (
    options.formatCategories ||
    options.formatBehaviorSwitches ||
    options.formatInterlanguageLinks
  ) {
    output = formatPageFooter(
      session.createContext(output),
      {
        formatCategories: options.formatCategories,
        formatBehaviorSwitches: options.formatBehaviorSwitches,
        formatInterlanguageLinks: options.formatInterlanguageLinks,
        interlanguagePlacement: options.interlanguagePlacement,
        interlanguagePrefixes: options.interlanguagePrefixes,
        behaviorSwitchPlacement: options.behaviorSwitchPlacement,
        localizationSource: options.localizationSource,
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: options.localizationAliases,
      },
    ).formatted;
  }
  return protectedText.restore(output);
}

export function documentStructuralFingerprint(
  source: string,
  options: ResolvedFormatOptions,
  session: ParserSession,
): DocumentFingerprint {
  source = canonicalizeDocumentSyntax(source, options, session);
  const context = session.createContext(source);
  const root = context.root as unknown as GenericNode;
  const normalizeDocumentWikilinkTarget: WikilinkTargetNormalizer = (
    node,
    target,
  ) => {
    if (!options.formatWikilinks) return target;
    const classification = classifyWikilinkNode(
      node as unknown as WikilinkParserNode,
      { interlanguagePrefixes: options.interlanguagePrefixes },
    );
    return classification.eligible && classification.target === target
      ? normalizeWikilinkPageTitleTarget(target)
      : target;
  };
  const templates = JSON.parse(
    templateStructuralFingerprintWithNormalizer(
      source,
      session,
      normalizeDocumentWikilinkTarget,
    ),
  ) as unknown;
  const tables = JSON.parse(
    tableStructuralFingerprint(source, session),
  ) as unknown;
  const links = structuralNodes(root, "link");
  const files = structuralNodes(root, "file");
  const externalLinks = structuralNodes(root, "ext-link");
  const extensions = structuralNodes(root, "ext");
  const categories = structuralNodes(root, "category");
  const magicWords = structuralNodes(root, "magic-word");
  const redirects = structuralNodes(root, "redirect");
  const headings = structuralNodes(root, "heading");
  const behaviorSwitches = structuralNodes(root, "double-underscore");
  const html = structuralNodes(root, "html");
  const comments = structuralNodes(root, "comment");
  const excludedParents = new Set(["template", "magic-word", "table", "ext"]);
  const ordinaryLinks = links.filter((node) => {
    if (isInside(node, excludedParents)) return false;
    const classification = classifyWikilinkNode(
      node as unknown as WikilinkParserNode,
      { interlanguagePrefixes: options.interlanguagePrefixes },
    );
    return (
      classification.eligible ||
      classification.reason !== "interwiki-or-interlanguage"
    );
  });
  const interlanguageLinks = links.filter((node) => {
    if (isInside(node, excludedParents)) return false;
    const classification = classifyWikilinkNode(
      node as unknown as WikilinkParserNode,
      { interlanguagePrefixes: options.interlanguagePrefixes },
    );
    return (
      !classification.eligible &&
      classification.reason === "interwiki-or-interlanguage"
    );
  });
  const defaultsort = magicWords.filter((node) =>
    /^(?:defaultsort|defaultsortkey)$/iu.test(node.name ?? ""),
  );
  const references = extensions.filter((node) =>
    /^(?:ref|references)$/iu.test(node.name ?? ""),
  );
  const opaqueExtensions = extensions.filter(
    (node) => !/^(?:ref|references)$/iu.test(node.name ?? ""),
  );

  const replacements: Array<{
    start: number;
    end: number;
    marker: string;
    removableLine?: boolean;
  }> = [];
  const add = (
    nodes: GenericNode[],
    category: string,
    removableLine = false,
  ): void => {
    nodes.forEach((node, index) => {
      const start = node.getAbsoluteIndex();
      const end = start + node.toString().length;
      replacements.push({
        start,
        end,
        marker: `⟪${category}:${index}⟫`,
        removableLine:
          removableLine && lineBounds(source, node, start, end).wholeLine,
      });
    });
  };
  const structuralParentTypes = new Set([
    "table",
    "template",
    "magic-word",
    "category",
    "file",
    "link",
    "ext-link",
    "ext",
    "redirect",
    "heading",
    "double-underscore",
    "html",
    "comment",
  ]);
  const topLevel = (nodes: GenericNode[]): GenericNode[] =>
    nodes.filter((node) => !isInside(node, structuralParentTypes));
  add(topLevel(structuralNodes(root, "table")), "table");
  add(
    topLevel([
      ...structuralNodes(root, "template"),
      ...magicWords.filter((node) => !defaultsort.includes(node)),
    ]),
    "template",
  );
  add(topLevel(defaultsort), "defaultsort", true);
  add(topLevel(categories), "category", true);
  add(topLevel(files), "file");
  add(topLevel(externalLinks), "external-link");
  add(topLevel(ordinaryLinks), "link");
  add(topLevel(interlanguageLinks), "interlanguage", true);
  add(topLevel(extensions), "extension");
  add(topLevel(redirects), "redirect");
  add(topLevel(headings), "heading");
  add(topLevel(behaviorSwitches), "behavior", true);
  add(topLevel(html), "html");
  add(topLevel(comments), "comment");

  const outermost = outermostSourceRanges(replacements);
  let prose = source;
  const hasRemovableMetadata = outermost.some(
    (replacement) => replacement.removableLine,
  );
  for (let index = outermost.length - 1; index >= 0; index--) {
    const replacement = outermost[index]!;
    if (replacement.removableLine) {
      const node = {
        getAbsoluteIndex: () => replacement.start,
        toString: () => source.slice(replacement.start, replacement.end),
      } as GenericNode;
      const bounds = lineBounds(source, node);
      prose = prose.slice(0, bounds.start) + prose.slice(bounds.end);
    } else {
      prose =
        prose.slice(0, replacement.start) +
        replacement.marker +
        prose.slice(replacement.end);
    }
  }
  prose = prose.replace(
    /^(⟪(?:file|external-link|extension|redirect|heading):\d+⟫)[ \t]+$/gmu,
    "$1",
  );
  prose = canonicalizeListLayout(prose);
  prose = normalizeBlankLines(prose);
  if (options.formatSectionSpacing) {
    prose = normalizeSectionSpacingSkeleton(prose);
  }
  if (hasRemovableMetadata) {
    prose = prose
      .replace(/^(?:[ \t]*\n)+/u, "")
      .replace(/(?:\n[ \t]*){2,}$/u, "\n");
  }

  return {
    templates,
    tables,
    links: ordinaryLinks.map((node) => ({
      target: semanticWikilinkTarget(node, normalizeDocumentWikilinkTarget),
      label: semanticChildText(node, "link-text"),
    })),
    files: files.map(semanticFile),
    externalLinks: externalLinks.map((node) => ({
      url: childText(node, "ext-link-url"),
      label: semanticChildText(node, "ext-link-text", "leading"),
    })),
    references: references.map(semanticExtension),
    categories: categories.map((node) => ({
      target: node.name ?? childText(node, "link-target"),
      sortKey: childText(node, "link-text"),
    })),
    defaultsort: defaultsort.map((node) => ({
      name: node.name?.toLowerCase(),
      value: node
        .querySelectorAll<GenericNode>("parameter")
        .map((parameter) => parameter.toString()),
    })),
    redirects: redirects.map((node) => ({
      target: semanticRedirectTarget(node, normalizeDocumentWikilinkTarget),
    })),
    headings: headings.map((node) => ({
      level: /^=+/u.exec(node.toString())?.[0].length ?? 0,
      text:
        semanticChildText(
          node,
          "heading-title",
          "both",
          normalizeDocumentWikilinkTarget,
        ) ?? "",
    })),
    behaviorSwitches: [
      ...new Set(
        behaviorSwitches.map((node) =>
          (node.name ?? node.toString()).toLowerCase(),
        ),
      ),
    ],
    interlanguageLinks: interlanguageLinks.map((node) => ({
      target: childText(node, "link-target"),
      label: semanticChildText(node, "link-text"),
    })),
    extensions: opaqueExtensions.map(semanticExtension),
    html: html.map(semanticHtml),
    comments: comments.map((node) => node.toString()),
    prose,
  };
}

export function verifyStructuralEquivalence(
  before: string,
  after: string,
  structure: StructuralEquivalenceKind,
  session: ParserSession,
  options?: ResolvedFormatOptions,
): StructuralEquivalenceResult {
  const normalizedBefore = normalizeSourceLineEndings(before);
  const normalizedAfter = normalizeSourceLineEndings(after);
  if (!normalizedBefore.supported || !normalizedAfter.supported) {
    const unsupported = !normalizedBefore.supported ? "before" : "after";
    const lineEnding = !normalizedBefore.supported
      ? normalizedBefore.lineEnding
      : !normalizedAfter.supported
        ? normalizedAfter.lineEnding
        : undefined;
    return {
      equivalent: false,
      structure,
      reason: `${unsupported} source uses unsupported ${lineEnding} line endings`,
    };
  }
  before = normalizedBefore.normalized;
  after = normalizedAfter.normalized;

  if (structure === "document") {
    if (!options) {
      throw new Error("Document equivalence requires resolved format options");
    }
    const beforeFingerprint = documentStructuralFingerprint(
      before,
      options,
      session,
    );
    const afterFingerprint = documentStructuralFingerprint(
      after,
      options,
      session,
    );
    for (const category of Object.keys(beforeFingerprint) as Array<
      keyof DocumentFingerprint
    >) {
      if (
        JSON.stringify(beforeFingerprint[category]) !==
        JSON.stringify(afterFingerprint[category])
      ) {
        return {
          equivalent: false,
          structure,
          reason: `${category} semantic fingerprint changed`,
        };
      }
    }
    return { equivalent: true, structure };
  }
  const fingerprint =
    structure === "templates"
      ? templateStructuralFingerprint
      : tableStructuralFingerprint;
  const beforeFingerprint = fingerprint(before, session);
  const afterFingerprint = fingerprint(after, session);
  if (beforeFingerprint === afterFingerprint) {
    return { equivalent: true, structure };
  }
  return {
    equivalent: false,
    structure,
    reason: `${structure} semantic fingerprint changed`,
  };
}

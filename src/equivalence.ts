import type { Config, ParameterToken, TranscludeToken } from "wikiparser-node";
import { createParserContext } from "./parserContext.js";
import {
  collectParserTableCandidates,
  type ParserTableNode,
} from "./rules/tables.js";

export type StructuralEquivalenceKind = "templates" | "tables";

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
  parentNode?: GenericNode;
  childNodes: readonly GenericNode[];
  getAbsoluteIndex(): number;
  toString(): string;
  querySelectorAll<T = GenericNode>(selector: string): T[];
}

interface TemplateFingerprint {
  type: string;
  name: string;
  parent: number | null;
  parameters: Array<{
    anon: boolean;
    name: string;
    value: string;
  }>;
}

function collectTransclusions(source: string, config: Config): TransclusionNode[] {
  const root = createParserContext(source, config).root;
  return [
    ...root.querySelectorAll<TransclusionNode>("template"),
    ...root.querySelectorAll<TransclusionNode>("magic-word"),
  ].sort((a, b) => a.getAbsoluteIndex() - b.getAbsoluteIndex());
}

function nearestTransclusion(node: GenericNode | undefined): TransclusionNode | undefined {
  let current = node;
  while (current) {
    if (current.type === "template" || current.type === "magic-word") {
      return current as TransclusionNode;
    }
    current = current.parentNode;
  }
  return undefined;
}

function replaceNestedTransclusions(
  valueNode: GenericNode,
  owner: TransclusionNode,
): string {
  const base = valueNode.getAbsoluteIndex();
  const raw = valueNode.toString();
  const nested = [
    ...valueNode.querySelectorAll<TransclusionNode>("template"),
    ...valueNode.querySelectorAll<TransclusionNode>("magic-word"),
  ]
    .filter((node) => nearestTransclusion(node.parentNode) === owner)
    .map((node) => ({
      start: node.getAbsoluteIndex() - base,
      end: node.getAbsoluteIndex() - base + node.toString().length,
      value: JSON.stringify(templateNodeFingerprint(node)),
    }))
    .sort((a, b) => b.start - a.start);
  let output = raw;
  for (const replacement of nested) {
    output =
      output.slice(0, replacement.start) +
      `\u0000template:${replacement.value}\u0000` +
      output.slice(replacement.end);
  }
  return output;
}

function templateNodeFingerprint(
  node: TransclusionNode,
): Omit<TemplateFingerprint, "parent"> {
  return {
    type: node.type,
    name: node.name,
    parameters: node.getAllArgs().map((arg: ParameterToken) => ({
      anon: arg.anon,
      name: arg.name,
      value: (() => {
        const value = replaceNestedTransclusions(
          arg.lastChild as unknown as GenericNode,
          node,
        );
        return arg.anon
          ? value.replace(/^[\t ]+/u, "").replace(/\n$/u, "")
          : value.trim();
      })(),
    })),
  };
}

export function templateStructuralFingerprint(
  source: string,
  config: Config,
): string {
  const nodes = collectTransclusions(source, config);
  const indices = new Map(nodes.map((node, index) => [node, index]));
  const fingerprint: TemplateFingerprint[] = nodes.map((node) => {
    const parent = nearestTransclusion(node.parentNode);
    return {
      ...templateNodeFingerprint(node),
      parent: parent ? (indices.get(parent) ?? null) : null,
    };
  });
  return JSON.stringify(fingerprint);
}

interface TableCellFingerprint {
  subtype: string;
  attributes: string;
  content: string;
}

interface TableFingerprint {
  parent: number | null;
  attributes: string;
  captions: TableCellFingerprint[];
  rows: Array<{
    attributes: string;
    cells: TableCellFingerprint[];
  }>;
}

function closestTable(node: ParserTableNode | undefined): ParserTableNode | undefined {
  let current = node;
  while (current && current.type !== "table") current = current.parentNode;
  return current;
}

function semanticTableCellContent(
  cell: ParserTableNode,
  owner: ParserTableNode,
): string {
  const inner = cell.childNodes[2];
  if (!inner) return "";
  const base = inner.getAbsoluteIndex();
  let output = inner.toString();
  const nestedTables = inner
    .querySelectorAll<ParserTableNode>("table")
    .filter((table) => closestTable(table.parentNode) === owner)
    .map((table) => ({
      start: table.getAbsoluteIndex() - base,
      end: table.getAbsoluteIndex() - base + table.toString().length,
      value: JSON.stringify(tableNodeFingerprint(table)),
    }))
    .map((replacement) => ({ ...replacement, kind: "table" as const }));
  const innerStart = base;
  const innerEnd = base + inner.toString().length;
  const nestedTransclusions = [
    ...inner.querySelectorAll<TransclusionNode>("template"),
    ...inner.querySelectorAll<TransclusionNode>("magic-word"),
  ]
    .filter((node) => {
      const parent = nearestTransclusion(node.parentNode);
      if (
        parent &&
        parent.getAbsoluteIndex() >= innerStart &&
        parent.getAbsoluteIndex() + parent.toString().length <= innerEnd
      ) {
        return false;
      }
      const start = node.getAbsoluteIndex() - base;
      const end = start + node.toString().length;
      return !nestedTables.some(
        (table) => table.start <= start && table.end >= end,
      );
    })
    .map((node) => ({
      start: node.getAbsoluteIndex() - base,
      end: node.getAbsoluteIndex() - base + node.toString().length,
      value: JSON.stringify(templateNodeFingerprint(node)),
      kind: "template" as const,
    }));
  const nested = [...nestedTables, ...nestedTransclusions].sort(
    (a, b) => b.start - a.start,
  );
  for (const replacement of nested) {
    output =
      output.slice(0, replacement.start) +
      `\u0000${replacement.kind}:${replacement.value}\u0000` +
      output.slice(replacement.end);
  }
  return output.trim();
}

function cellFingerprint(
  cell: ParserTableNode & { subtype?: string },
  owner: ParserTableNode,
): TableCellFingerprint {
  return {
    subtype: cell.subtype ?? "td",
    attributes: cell.childNodes[1]?.toString().trim() ?? "",
    content: semanticTableCellContent(cell, owner),
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
      attributes: row.childNodes[1]?.toString().trim() ?? "",
      cells: directCells(row, table).map((cell) =>
        cellFingerprint(cell, table),
      ),
    });
  }
  return {
    attributes: table.childNodes[1]?.toString().trim() ?? "",
    captions,
    rows,
  };
}

export function tableStructuralFingerprint(
  source: string,
  config: Config,
): string {
  const context = createParserContext(source, config);
  const candidates = collectParserTableCandidates(source, context, config);
  const fingerprint: TableFingerprint[] = candidates.map((candidate, index) => {
    let parent = -1;
    for (let possibleIndex = 0; possibleIndex < candidates.length; possibleIndex++) {
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

export function verifyStructuralEquivalence(
  before: string,
  after: string,
  config: Config,
  structure: StructuralEquivalenceKind,
): StructuralEquivalenceResult {
  const fingerprint =
    structure === "templates"
      ? templateStructuralFingerprint
      : tableStructuralFingerprint;
  const beforeFingerprint = fingerprint(before, config);
  const afterFingerprint = fingerprint(after, config);
  if (beforeFingerprint === afterFingerprint) {
    return { equivalent: true, structure };
  }
  return {
    equivalent: false,
    structure,
    reason: `${structure} semantic fingerprint changed`,
  };
}

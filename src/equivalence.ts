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
    value: string | TemplateValuePart[];
  }>;
}

type TemplateValuePart =
  | string
  | { kind: "template"; value: Omit<TemplateFingerprint, "parent"> };

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

function semanticTransclusionValue(
  valueNode: GenericNode,
  owner: TransclusionNode,
  trim: boolean,
): string | TemplateValuePart[] {
  const base = valueNode.getAbsoluteIndex();
  const raw = valueNode.toString();
  const content = trim ? raw.trim() : raw;
  const contentStart = trim ? raw.indexOf(content) : 0;
  const contentEnd = contentStart + content.length;
  const nested = [
    ...valueNode.querySelectorAll<TransclusionNode>("template"),
    ...valueNode.querySelectorAll<TransclusionNode>("magic-word"),
  ]
    .filter((node) => nearestTransclusion(node.parentNode) === owner)
    .map((node) => ({
      start: node.getAbsoluteIndex() - base,
      end: node.getAbsoluteIndex() - base + node.toString().length,
      part: {
        kind: "template" as const,
        value: templateNodeFingerprint(node),
      },
    }))
    .filter(
      (replacement) =>
        replacement.start >= contentStart && replacement.end <= contentEnd,
    )
    .sort((a, b) => a.start - b.start);
  if (nested.length === 0) return content;
  const parts: TemplateValuePart[] = [];
  let cursor = contentStart;
  for (const replacement of nested) {
    if (replacement.start > cursor) {
      parts.push(raw.slice(cursor, replacement.start));
    }
    parts.push(replacement.part);
    cursor = replacement.end;
  }
  if (cursor < contentEnd) parts.push(raw.slice(cursor, contentEnd));
  return parts;
}

function templateNodeFingerprint(
  node: TransclusionNode,
): Omit<TemplateFingerprint, "parent"> {
  return {
    type: node.type,
    name: node.name,
    parameters: node.getAllArgs().map((arg: ParameterToken) => ({
      anon: arg.anon,
      name: arg.anon ? arg.name : arg.name.trim(),
      value: semanticTransclusionValue(
        arg.lastChild as unknown as GenericNode,
        node,
        !arg.anon,
      ),
    })),
  };
}

function outermostParserConfirmedTables(source: string, config: Config) {
  const context = createParserContext(source, config);
  return collectParserTableCandidates(source, context, config)
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
        ...templateNodeFingerprint(node),
        parent: parent ? (indices.get(parent) ?? null) : null,
      };
    });
  });
}

export function templateStructuralFingerprint(
  source: string,
  config: Config,
): string {
  const hasTableOpener = source.includes("{|");
  const tables = hasTableOpener
    ? outermostParserConfirmedTables(source, config)
    : [];
  const nodes = collectTransclusions(
    hasTableOpener ? maskParserConfirmedTables(source, tables) : source,
    config,
  );
  const indices = new Map(nodes.map((node, index) => [node, index]));
  const fingerprint: TemplateFingerprint[] = nodes.map((node) => {
    const parent = nearestTransclusion(node.parentNode);
    return {
      ...templateNodeFingerprint(node),
      parent: parent ? (indices.get(parent) ?? null) : null,
    };
  });
  return JSON.stringify({
    templates: fingerprint,
    templatesInsideTables: templatesInsideParserConfirmedTables(tables),
  });
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

function closestTable(node: ParserTableNode | undefined): ParserTableNode | undefined {
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
    .filter((replacement): replacement is NonNullable<typeof replacement> =>
      replacement !== undefined
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
    .filter((replacement): replacement is NonNullable<typeof replacement> =>
      replacement !== undefined
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

function cellFingerprint(
  cell: ParserTableNode & { subtype?: string },
  owner: ParserTableNode,
): TableCellFingerprint {
  return {
    subtype: cell.subtype ?? "td",
    attributes: cell.childNodes[1]?.toString() ?? "",
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

import {
  collectNodes,
  isNodeWholeLine,
  lineIndexAt,
  lineTextAt,
  type ParserNodeLike,
  type ParsedDocumentContext,
} from "../parserContext.js";

const HEADING = /^={2,6}[^=\n].*={2,6}[ \t]*$/u;
const BLANK = /^[ \t]*$/u;

export interface SectionSpacingDiagnostics {
  sectionSpacingBeforeHeadingsInserted: number;
  sectionSpacingAfterHeadingsInserted: number;
}

export interface SectionSpacingResult {
  formatted: string;
  diagnostics: SectionSpacingDiagnostics;
}

interface HeadingNode extends ParserNodeLike {
  parentNode?: { type?: string };
}

function isHeading(line: string): boolean {
  return HEADING.test(line.trimEnd());
}

function parserHeadingLineIndexes(
  source: string,
  lines: readonly string[],
  context?: ParsedDocumentContext,
): Set<number> | undefined {
  if (context?.source !== source) return undefined;
  const indexes = new Set<number>();
  for (const node of collectNodes(context, "heading") as HeadingNode[]) {
    if (node.parentNode?.type !== "root") continue;
    if (!isNodeWholeLine(context, node)) continue;
    const lineIndex = lineIndexAt(context, node.getAbsoluteIndex());
    const line = lines[lineIndex] ?? lineTextAt(context, lineIndex);
    // wikiparser-node also exposes level-1 headings. Section spacing is
    // intentionally limited to complete level 2-6 headings.
    if (isHeading(line)) indexes.add(lineIndex);
  }
  return indexes;
}

export function formatSectionSpacing(
  source: string,
  context?: ParsedDocumentContext,
): SectionSpacingResult {
  const diagnostics: SectionSpacingDiagnostics = {
    sectionSpacingBeforeHeadingsInserted: 0,
    sectionSpacingAfterHeadingsInserted: 0,
  };
  const finalNewline = /\n$/u.test(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const output: string[] = [];
  const parserHeadingLines = parserHeadingLineIndexes(source, lines, context);
  const lineIsHeading = (index: number): boolean =>
    parserHeadingLines
      ? parserHeadingLines.has(index)
      : isHeading(lines[index]!);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (lineIsHeading(index)) {
      const previous = index - 1;
      if (
        previous >= 0 &&
        !BLANK.test(lines[previous]!) &&
        !lineIsHeading(previous)
      ) {
        output.push("");
        diagnostics.sectionSpacingBeforeHeadingsInserted++;
      }
    }
    output.push(line);
    if (lineIsHeading(index)) {
      const next = index + 1;
      if (
        next < lines.length &&
        !BLANK.test(lines[next]!) &&
        !lineIsHeading(next)
      ) {
        output.push("");
        diagnostics.sectionSpacingAfterHeadingsInserted++;
      }
    }
  }

  return {
    formatted: `${output.join("\n")}${finalNewline ? "\n" : ""}`,
    diagnostics,
  };
}

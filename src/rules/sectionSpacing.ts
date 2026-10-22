import {
  collectNodes,
  isNodeWholeLine,
  lineIndexAt,
  lineTextAt,
  type ParserNodeLike,
  type ParsedDocumentContext,
} from "../parserContext.js";

const HEADING = /^(={1,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/u;
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
  const title = HEADING.exec(line)?.[2];
  return Boolean(title && !title.startsWith("=") && !title.endsWith("="));
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
    // Only complete standalone headings are eligible for section spacing.
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

  // A blank line before a heading is near-universal practice; one after it is a
  // per-page habit. Follow the page: add the blank line after headings only
  // when most headings followed by content already have one.
  let blankAfter = 0;
  let contentAfter = 0;
  for (let index = 0; index + 1 < lines.length; index++) {
    if (!lineIsHeading(index) || lineIsHeading(index + 1)) continue;
    if (BLANK.test(lines[index + 1]!)) blankAfter++;
    else contentAfter++;
  }
  const spaceAfterHeadings = blankAfter > contentAfter;

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
    if (spaceAfterHeadings && lineIsHeading(index)) {
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

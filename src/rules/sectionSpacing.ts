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
// MediaWiki removes a comment-only line (possibly spanning several lines)
// together with one adjacent newline, so a blank line inserted next to it can
// turn into an empty paragraph. Leave headings touching a comment alone.
const COMMENT_END = /-->[ \t]*$/u;
const COMMENT_START = /^[ \t]*<!--/u;
const TEMPLATE_LINE = /^[ \t]*\{\{(?![ \t]*#)[^{}|:]*(?:\||\}\}[ \t]*$)/u;

/**
 * Whether a line is one complete ordinary template call, such as an anchor
 * above a heading or a hatnote below one. Parser functions and magic words
 * like `{{DEFAULTSORT:…}}` do not count.
 */
function isTemplateLine(line: string): boolean {
  if (!TEMPLATE_LINE.test(line)) return false;
  const text = line.trim();
  if (!text.endsWith("}}")) return false;
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.startsWith("{{", index)) {
      depth++;
      index++;
    } else if (text.startsWith("}}", index)) {
      depth--;
      index++;
      if (depth === 0) return index === text.length - 1;
    }
  }
  return false;
}

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

/**
 * `restore` maps a line containing protected-block placeholders back to its
 * source text, so that protected comments are still recognized.
 */
export function formatSectionSpacing(
  source: string,
  context?: ParsedDocumentContext,
  restore: (text: string) => string = (text) => text,
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
  const separated = (index: number, comment: RegExp): boolean =>
    BLANK.test(lines[index]!) ||
    comment.test(restore(lines[index]!)) ||
    lineIsHeading(index);
  // Single-line templates that touch a heading on one side and are set off from
  // other content on the other, like anchors above a heading, belong to it.
  const attachedAbove = (index: number): boolean => {
    let start = index;
    while (start >= 0 && isTemplateLine(restore(lines[start]!))) start--;
    return start < index && (start < 0 || separated(start, COMMENT_END));
  };
  // Below a heading, a template line is a hatnote or the section's only
  // content, like {{Reflist}}; keep it on the next line.
  const attachedBelow = (index: number): boolean =>
    isTemplateLine(restore(lines[index]!));

  // A blank line before a heading is near-universal practice; one after it is a
  // per-page habit. Follow the page: add the blank line after headings only
  // when most headings followed by content already have one.
  let blankAfter = 0;
  let contentAfter = 0;
  for (let index = 0; index + 1 < lines.length; index++) {
    if (!lineIsHeading(index) || lineIsHeading(index + 1)) continue;
    if (attachedBelow(index + 1)) continue;
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
        !separated(previous, COMMENT_END) &&
        !attachedAbove(previous)
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
        !separated(next, COMMENT_START) &&
        !attachedBelow(next)
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

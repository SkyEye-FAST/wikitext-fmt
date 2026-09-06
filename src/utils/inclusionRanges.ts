import {
  collectNodes,
  nodeRange,
  type ParsedDocumentContext,
  type SourceRange,
} from "../parserContext.js";

export interface InclusionRange extends SourceRange {
  name: string;
  closed: boolean;
}

/** Track parser-confirmed transclusion boundaries, including opaque include nodes. */
export function collectInclusionRanges(context: ParsedDocumentContext): InclusionRange[] {
  const ranges: InclusionRange[] = [];
  const stack: { name: string; start: number }[] = [];
  const nodes = collectNodes(context, "include,noinclude,onlyinclude")
    .sort((a, b) => a.getAbsoluteIndex() - b.getAbsoluteIndex());
  for (const node of nodes) {
    const raw = node.toString();
    const match = /^<(\/?)(includeonly|noinclude|onlyinclude)\b[^>]*>/iu.exec(raw);
    if (!match) continue;
    const range = nodeRange(node);
    if (context.source.slice(range.start, range.end) !== raw) continue;
    const name = match[2]!.toLowerCase();
    const selfClosing = /\/\s*>$/u.test(match[0]);
    if (raw.length > match[0].length || selfClosing) {
      ranges.push({
        ...range,
        name,
        closed: selfClosing || new RegExp(`</${name}\\s*>$`, "iu").test(raw),
      });
    } else if (!match[1]) {
      stack.push({ name, start: range.start });
    } else {
      const open = stack.at(-1);
      if (open?.name === name) {
        stack.pop();
        ranges.push({ start: open.start, end: range.end, name, closed: true });
      } else if (open) {
        // Mismatched nesting cannot establish a safe destination for footer moves.
        ranges.push({ start: stack[0]!.start, end: context.source.length, name, closed: false });
        stack.length = 0;
      }
    }
  }
  for (const open of stack) {
    ranges.push({ ...open, end: context.source.length, closed: false });
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

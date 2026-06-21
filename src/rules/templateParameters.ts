import { hasFinalNewline, withFinalNewline } from "../utils/text.js";

export interface TemplateParameterDiagnostics {
  templateParametersFormatted: number;
  templateParameterLinesFormatted: number;
  templateParameterLinesSkippedUnsafe: number;
}

export interface TemplateParameterResult {
  formatted: string;
  diagnostics: TemplateParameterDiagnostics;
}

interface TemplateBlock {
  start: number;
  end: number;
}

const PARAM_LINE = /^([ \t]*)\|([\p{L}\p{N}\p{M}_ -]+)[ \t]*=[ \t]*(.*)$/u;
const RISKY_VALUE =
  /(?:\{\{|\}\}|\{\||\|\}|^[-*#:;]|<!--|<[A-Za-z!/]|#(?:if|switch|expr|invoke|tag):|\[\[[^\]\n]*\|[^\]\n]*\]\])/iu;

function emptyDiagnostics(): TemplateParameterDiagnostics {
  return {
    templateParametersFormatted: 0,
    templateParameterLinesFormatted: 0,
    templateParameterLinesSkippedUnsafe: 0,
  };
}

function findTemplateBlocks(lines: readonly string[]): TemplateBlock[] {
  const blocks: TemplateBlock[] = [];
  let depth = 0;
  let start = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const opens = line.match(/\{\{/gu)?.length ?? 0;
    const closes = line.match(/\}\}/gu)?.length ?? 0;
    if (depth === 0 && opens > 0) start = index;
    depth += opens - closes;
    if (depth === 0 && start >= 0) {
      if (index > start) blocks.push({ start, end: index });
      start = -1;
    }
    if (depth < 0) {
      depth = 0;
      start = -1;
    }
  }
  return blocks;
}

function isSimpleTemplateBoundary(
  lines: readonly string[],
  block: TemplateBlock,
): boolean {
  const first = lines[block.start]!;
  const last = lines[block.end]!;
  if (!/^\{\{[^{}\n|#]+[ \t]*$/u.test(first)) return false;
  if (!/^[ \t]*\}\}[ \t]*$/u.test(last)) return false;
  for (let index = block.start + 1; index < block.end; index++) {
    const line = lines[index]!;
    if (/\{\{|\}\}|\uE000wikitext-fmt:/u.test(line)) return false;
  }
  return true;
}

function formatTemplateParameterLine(line: string): {
  value: string;
  skippedUnsafe: boolean;
} {
  if (/<!--/u.test(line)) return { value: line, skippedUnsafe: true };
  const match = PARAM_LINE.exec(line);
  if (
    !match ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    if (/^[ \t]*\|/u.test(line)) return { value: line, skippedUnsafe: true };
    return { value: line, skippedUnsafe: false };
  }
  const [, indent, name, value] = match;
  if (!name.trim() || /^\p{N}+$/u.test(name.trim()))
    return { value: line, skippedUnsafe: true };
  if (RISKY_VALUE.test(value)) return { value: line, skippedUnsafe: true };
  const trimmedValue = value.replace(/[ \t]+$/u, "");
  return {
    value: `${indent}| ${name.trim()} = ${trimmedValue}`,
    skippedUnsafe: false,
  };
}

export function formatTemplateParameters(
  source: string,
): TemplateParameterResult {
  const diagnostics = emptyDiagnostics();
  const finalNewline = hasFinalNewline(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const blocks = findTemplateBlocks(lines);
  let changed = false;

  for (const block of blocks) {
    if (!isSimpleTemplateBoundary(lines, block)) continue;
    let blockChanged = false;
    for (let index = block.start; index <= block.end; index++) {
      const original = lines[index]!;
      if (index === block.start || index === block.end) {
        const trimmed = original.replace(/[ \t]+$/u, "");
        if (trimmed !== original) {
          lines[index] = trimmed;
          changed = true;
          blockChanged = true;
        }
        continue;
      }
      const formatted = formatTemplateParameterLine(original);
      if (formatted.skippedUnsafe)
        diagnostics.templateParameterLinesSkippedUnsafe++;
      if (formatted.value !== original) {
        lines[index] = formatted.value;
        changed = true;
        blockChanged = true;
        diagnostics.templateParameterLinesFormatted++;
      }
    }
    if (blockChanged) diagnostics.templateParametersFormatted++;
  }

  return {
    formatted: changed
      ? withFinalNewline(lines.join("\n"), finalNewline)
      : source,
    diagnostics,
  };
}

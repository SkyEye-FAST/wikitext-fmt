const HEADING = /^={2,6}[^=\n].*={2,6}[ \t]*$/u;
const BLANK = /^[ \t]*$/u;
const RISKY =
  /^(?:[ \t]*$|=|\{\||\|\}|[|!]|[*#:;]|<!--|__|＿＿|\[\[(?:Category|File|Image|[A-Za-z-]+):|#\w|<|<\/|\uE000wikitext-fmt:|\{\{)/iu;

export interface SectionSpacingDiagnostics {
  sectionSpacingBeforeHeadingsInserted: number;
  sectionSpacingAfterHeadingsInserted: number;
}

export interface SectionSpacingResult {
  formatted: string;
  diagnostics: SectionSpacingDiagnostics;
}

function isHeading(line: string): boolean {
  return HEADING.test(line.trimEnd());
}

function isOrdinaryParagraph(line: string): boolean {
  return line.trimStart() === line && !RISKY.test(line);
}

function previousNonBlank(lines: readonly string[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (!BLANK.test(lines[i]!)) return i;
  }
  return -1;
}

function nextNonBlank(lines: readonly string[], index: number): number {
  for (let i = index + 1; i < lines.length; i++) {
    if (!BLANK.test(lines[i]!)) return i;
  }
  return -1;
}

export function formatSectionSpacing(source: string): SectionSpacingResult {
  const diagnostics: SectionSpacingDiagnostics = {
    sectionSpacingBeforeHeadingsInserted: 0,
    sectionSpacingAfterHeadingsInserted: 0,
  };
  const finalNewline = /\n$/u.test(source);
  const lines = source.split("\n");
  if (finalNewline) lines.pop();
  const output: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (isHeading(line)) {
      const previous = previousNonBlank(lines, index);
      if (
        previous >= 0 &&
        previous === index - 1 &&
        isOrdinaryParagraph(lines[previous]!)
      ) {
        output.push("");
        diagnostics.sectionSpacingBeforeHeadingsInserted++;
      }
    }
    output.push(line);
    if (isHeading(line)) {
      const next = nextNonBlank(lines, index);
      if (
        next >= 0 &&
        next === index + 1 &&
        isOrdinaryParagraph(lines[next]!)
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

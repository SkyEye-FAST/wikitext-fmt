const LIST_LINE = /^([*#:;]+)([ \t]*)(\S.*)$/u;
const RISKY_LIST_CONTENT =
  /(?:\{\{|\}\}|\{\||\|\}|\[\[|\]\]|<\/?[A-Za-z!]|\uE000wikitext-fmt:)/u;

/** Format only ordinary, single-line list items with no nested wikitext structures. */
export function formatLists(source: string): string {
  return source.replace(/^.*$/gmu, (line) => {
    const match = LIST_LINE.exec(line);
    if (!match) return line;
    const [, markers, spacing, content] = match;
    if (
      !markers ||
      spacing === undefined ||
      !content ||
      RISKY_LIST_CONTENT.test(content)
    )
      return line;

    const trimmedContent = content.replace(/[ \t]+$/u, "");
    return `${markers}${spacing.length === 0 ? " " : spacing}${trimmedContent}`;
  });
}

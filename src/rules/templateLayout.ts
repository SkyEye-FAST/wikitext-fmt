/**
 * Layout helpers for multiline template parameters: column measurement,
 * detection of intentionally aligned `=` signs, and nesting indentation.
 *
 * Every helper here only decides syntax whitespace that MediaWiki discards:
 * padding after a named key, whitespace after `=` in a named value, and
 * indentation before a named parameter's `|` or before `}}` when the previous
 * argument is named. Callers remain responsible for structural verification.
 */

export type TextMeasure = (text: string) => number;

/** One nesting level of multiline templates inside another template. */
export const TEMPLATE_NEST_INDENT = "  ";

const WIDE_CHARACTER =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u;
const ZERO_WIDTH_CHARACTER = /[\p{Mn}\p{Me}\u200B-\u200F\u2060\uFEFF]/u;

/** Monospace display columns: East Asian wide characters take two. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    if (ZERO_WIDTH_CHARACTER.test(character)) continue;
    width += WIDE_CHARACTER.test(character) ? 2 : 1;
  }
  return width;
}

/** Code-point columns, for sources aligned in proportional editors. */
export function codePointWidth(text: string): number {
  let width = 0;
  for (const _character of text) width++;
  return width;
}

const ALIGNMENT_MEASURES: readonly TextMeasure[] = [
  displayWidth,
  codePointWidth,
];

export interface KeyAlignment {
  readonly measure: TextMeasure;
  /** Width every shorter key is padded to before ` =`. */
  readonly width: number;
}

function trimLayoutWhitespace(text: string): string {
  return text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/gu, "");
}

/**
 * Decide whether line-start named parameters were deliberately aligned.
 *
 * `keySegments` are the exact source bytes between each parameter's `|` and
 * its `=`. The parameters count as aligned when most of them put `=` in the
 * same column and that column was reached by padding: some key in the group
 * carries at least two trailing spaces, or, for compact `|key=` segments
 * without leading spaces, some keys are padded while another is not.
 * Equal-length keys with uniform spacing alone prove nothing. The returned
 * width is the longest key in the aligned group, so an outlier key that
 * already overflowed the author's column does not push every other row.
 */
export function detectKeyAlignment(
  keySegments: readonly string[],
): KeyAlignment | undefined {
  if (keySegments.length < 2) return undefined;
  if (keySegments.some((segment) => /[\t\r\n]/u.test(segment))) {
    return undefined;
  }
  for (const measure of ALIGNMENT_MEASURES) {
    const columns = new Map<
      number,
      {
        count: number;
        minPad: number;
        maxPad: number;
        compact: boolean;
        width: number;
      }
    >();
    for (const segment of keySegments) {
      const column = measure(segment);
      const pad = / *$/u.exec(segment)![0].length;
      const entry = columns.get(column) ?? {
        count: 0,
        minPad: pad,
        maxPad: pad,
        compact: true,
        width: 0,
      };
      entry.count++;
      entry.minPad = Math.min(entry.minPad, pad);
      entry.maxPad = Math.max(entry.maxPad, pad);
      if (/^[ \t]/u.test(segment)) entry.compact = false;
      entry.width = Math.max(entry.width, measure(trimLayoutWhitespace(segment)));
      columns.set(column, entry);
    }
    const best = [...columns.values()].sort((a, b) => b.count - a.count)[0]!;
    if (
      (best.maxPad >= 2 ||
        (best.compact && best.minPad === 0 && best.maxPad > 0)) &&
      best.count >= 2 &&
      best.count >= Math.ceil(keySegments.length * 0.6)
    ) {
      return { measure, width: best.width };
    }
  }
  return undefined;
}

export function padKey(key: string, alignment?: KeyAlignment): string {
  if (!alignment) return key;
  return key + " ".repeat(Math.max(0, alignment.width - alignment.measure(key)));
}

export function nestingIndent(depth: number): string {
  return TEMPLATE_NEST_INDENT.repeat(Math.max(0, depth));
}

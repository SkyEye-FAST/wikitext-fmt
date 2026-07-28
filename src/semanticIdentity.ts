export interface SemanticSourceRange {
  start: number;
  end: number;
}

export interface SemanticIdentityStats {
  rangeCount: number;
  containmentChecks: number;
}

export function outermostSourceRanges<T extends SemanticSourceRange>(
  ranges: readonly T[],
  stats?: SemanticIdentityStats,
): T[] {
  if (stats) {
    stats.rangeCount = ranges.length;
    stats.containmentChecks = 0;
  }
  const outermost: T[] = [];
  for (const range of [...ranges].sort(
    (a, b) => a.start - b.start || b.end - a.end,
  )) {
    const previous = outermost.at(-1);
    if (previous) {
      if (stats) stats.containmentChecks++;
      if (previous.start <= range.start && previous.end >= range.end) continue;
    }
    outermost.push(range);
  }
  return outermost;
}

export function semanticRangeIdentities(
  ranges: readonly SemanticSourceRange[],
  prefix: string,
  stats?: SemanticIdentityStats,
): string[] {
  if (stats) {
    stats.rangeCount = ranges.length;
    stats.containmentChecks = 0;
  }
  const order = ranges
    .map((range, index) => ({ range, index }))
    .sort(
      (a, b) =>
        a.range.start - b.range.start ||
        b.range.end - a.range.end ||
        a.index - b.index,
    );
  const stack: number[] = [];
  const identities = new Array<string>(ranges.length);
  const nextOccurrence = new Map<number | undefined, number>();

  for (const { range, index } of order) {
    while (stack.length > 0) {
      const candidateIndex = stack.at(-1)!;
      const candidate = ranges[candidateIndex]!;
      if (stats) stats.containmentChecks++;
      const strictlyContains =
        candidate.start <= range.start &&
        candidate.end >= range.end &&
        (candidate.start < range.start || candidate.end > range.end);
      if (strictlyContains) break;
      stack.pop();
    }
    const parent = stack.at(-1);
    const occurrence = nextOccurrence.get(parent) ?? 0;
    nextOccurrence.set(parent, occurrence + 1);
    identities[index] =
      parent === undefined
        ? `${prefix}/${occurrence}`
        : `${identities[parent]}/${occurrence}`;
    stack.push(index);
  }

  return identities;
}

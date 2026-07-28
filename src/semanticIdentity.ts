export interface SemanticSourceRange {
  start: number;
  end: number;
}

export function semanticRangeIdentities(
  ranges: readonly SemanticSourceRange[],
  prefix: string,
): string[] {
  const parents = ranges.map((range, index) => {
    let parent: number | undefined;
    let parentSpan = Number.POSITIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < ranges.length; candidateIndex++) {
      if (candidateIndex === index) continue;
      const candidate = ranges[candidateIndex]!;
      const contains =
        candidate.start <= range.start &&
        candidate.end >= range.end &&
        (candidate.start < range.start || candidate.end > range.end);
      const span = candidate.end - candidate.start;
      if (contains && span < parentSpan) {
        parent = candidateIndex;
        parentSpan = span;
      }
    }
    return parent;
  });
  const identities: Array<string | undefined> = new Array(ranges.length);

  const identityFor = (index: number): string => {
    const existing = identities[index];
    if (existing) return existing;
    const parent = parents[index];
    const siblings = ranges
      .map((range, siblingIndex) => ({ range, siblingIndex }))
      .filter(({ siblingIndex }) => parents[siblingIndex] === parent)
      .sort(
        (a, b) =>
          a.range.start - b.range.start ||
          b.range.end - a.range.end ||
          a.siblingIndex - b.siblingIndex,
      );
    const occurrence = siblings.findIndex(
      ({ siblingIndex }) => siblingIndex === index,
    );
    const parentIdentity =
      parent === undefined ? prefix : identityFor(parent);
    const identity = `${parentIdentity}/${occurrence}`;
    identities[index] = identity;
    return identity;
  };

  return ranges.map((_range, index) => identityFor(index));
}

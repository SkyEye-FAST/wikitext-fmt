type DiffOperation =
  | { type: "context"; line: string }
  | { type: "remove"; line: string }
  | { type: "add"; line: string };

function findSynchronization(
  before: readonly string[],
  after: readonly string[],
  beforeIndex: number,
  afterIndex: number,
): [number, number] | undefined {
  const window = 200;
  let best: [number, number] | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (
    let beforeOffset = 0;
    beforeOffset <= window && beforeIndex + beforeOffset < before.length;
    beforeOffset++
  ) {
    for (
      let afterOffset = 0;
      afterOffset <= window && afterIndex + afterOffset < after.length;
      afterOffset++
    ) {
      const distance = beforeOffset + afterOffset;
      if (distance >= bestDistance) continue;
      if (
        before[beforeIndex + beforeOffset] === after[afterIndex + afterOffset]
      ) {
        best = [beforeOffset, afterOffset];
        bestDistance = distance;
      }
    }
  }
  return best;
}

function diffLines(original: string, formatted: string): DiffOperation[] {
  const before = original.split("\n");
  const after = formatted.split("\n");
  const operations: DiffOperation[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < before.length || afterIndex < after.length) {
    if (
      before[beforeIndex] === after[afterIndex] &&
      beforeIndex < before.length &&
      afterIndex < after.length
    ) {
      operations.push({ type: "context", line: before[beforeIndex]! });
      beforeIndex++;
      afterIndex++;
      continue;
    }
    const synchronization = findSynchronization(
      before,
      after,
      beforeIndex,
      afterIndex,
    );
    const beforeOffset = synchronization?.[0] ?? before.length - beforeIndex;
    const afterOffset = synchronization?.[1] ?? after.length - afterIndex;
    for (let index = 0; index < beforeOffset; index++) {
      operations.push({ type: "remove", line: before[beforeIndex + index]! });
    }
    for (let index = 0; index < afterOffset; index++) {
      operations.push({ type: "add", line: after[afterIndex + index]! });
    }
    beforeIndex += beforeOffset;
    afterIndex += afterOffset;
  }
  return operations;
}

function linePosition(
  operations: readonly DiffOperation[],
  end: number,
  type: "old" | "new",
): number {
  let line = 1;
  for (const operation of operations.slice(0, end)) {
    if (
      operation.type === "context" ||
      (type === "old" ? operation.type === "remove" : operation.type === "add")
    ) {
      line++;
    }
  }
  return line;
}

export function createUnifiedDiff(
  label: string,
  original: string,
  formatted: string,
  context = 3,
): string {
  if (original === formatted) return "";
  const operations = diffLines(original, formatted);
  const changed = operations
    .map((operation, index) => (operation.type === "context" ? -1 : index))
    .filter((index) => index >= 0);
  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(operations.length, index + context + 1);
    const previous = ranges.at(-1);
    if (previous && start <= previous[1])
      previous[1] = Math.max(previous[1], end);
    else ranges.push([start, end]);
  }

  const output = [`--- ${label}`, `+++ ${label}`];
  for (const [start, end] of ranges) {
    const hunk = operations.slice(start, end);
    const oldStart = linePosition(operations, start, "old");
    const newStart = linePosition(operations, start, "new");
    const oldCount = hunk.filter(
      (operation) => operation.type !== "add",
    ).length;
    const newCount = hunk.filter(
      (operation) => operation.type !== "remove",
    ).length;
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const operation of hunk) {
      const marker =
        operation.type === "context" ? " "
        : operation.type === "remove" ? "-"
        : "+";
      output.push(`${marker}${operation.line}`);
    }
  }
  return `${output.join("\n")}\n`;
}

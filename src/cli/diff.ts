function lines(value: string): string[] {
  return value.split("\n");
}

export function createUnifiedDiff(label: string, original: string, formatted: string): string {
  if (original === formatted) return "";
  const before = lines(original);
  const after = lines(formatted);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix
    && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;

  const context = 3;
  const beforeStart = Math.max(0, prefix - context);
  const afterStart = Math.max(0, prefix - context);
  const beforeEnd = Math.min(before.length, before.length - suffix + context);
  const afterEnd = Math.min(after.length, after.length - suffix + context);
  const beforeCount = beforeEnd - beforeStart;
  const afterCount = afterEnd - afterStart;
  const output = [
    `--- ${label}`,
    `+++ ${label}`,
    `@@ -${beforeStart + 1},${beforeCount} +${afterStart + 1},${afterCount} @@`,
  ];
  for (const line of before.slice(beforeStart, prefix)) output.push(` ${line}`);
  for (const line of before.slice(prefix, before.length - suffix)) output.push(`-${line}`);
  for (const line of after.slice(prefix, after.length - suffix)) output.push(`+${line}`);
  for (const line of before.slice(before.length - suffix, beforeEnd)) output.push(` ${line}`);
  return `${output.join("\n")}\n`;
}

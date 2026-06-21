export function normalizeBlankLines(source: string): string {
  return source.replace(/(?:^[ \t]*\n){3,}/gmu, "\n\n");
}

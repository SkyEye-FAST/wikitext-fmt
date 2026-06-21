export function hasFinalNewline(source: string): boolean {
  return /\r?\n$/u.test(source);
}

export function withFinalNewline(
  source: string,
  finalNewline: boolean,
): string {
  const stripped = source.replace(/\n+$/u, "");
  return finalNewline ? `${stripped}\n` : stripped;
}

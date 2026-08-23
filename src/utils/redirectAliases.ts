function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function normalizeRedirectAlias(alias: string): string {
  return alias.startsWith("#") || alias.startsWith("＃")
    ? alias
    : `#${alias}`;
}

export function matchRedirectAliasPrefix(
  line: string,
  alias: string,
): string | undefined {
  const normalized = normalizeRedirectAlias(alias);
  return new RegExp(`^${escapeRegExp(normalized)}`, "iu").exec(line)?.[0];
}

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const behaviorIds = new Set([
  "notoc", "forcetoc", "toc", "noeditsection", "newsectionlink", "nonewsectionlink",
  "index", "noindex", "nogallery", "hiddencat", "nocontentconvert", "notitleconvert",
  "staticredirect",
]);

function phpString(value: string): string {
  return value.replace(/\\'/gu, "'").replace(/\\\\/gu, "\\");
}

function arrayBlock(source: string, variable: string): string {
  const start = source.indexOf(`$${variable} = [`);
  if (start < 0) return "";
  const end = source.indexOf("\n];", start);
  return end < 0 ? "" : source.slice(start, end + 3);
}

function quotedValues(source: string): string[] {
  return [...source.matchAll(/'((?:\\'|[^'])*)'/gu)].map((match) => phpString(match[1] ?? ""));
}

const inputDirectory = resolve(process.argv[2] ?? "vendor/mediawiki/languages/messages");
const outputPath = resolve(process.argv[3] ?? "src/localization/generated/mediawiki-aliases.json");
const files = (await readdir(inputDirectory))
  .filter((name) => /^Messages(?:Zh_hans|Zh_hant|Ja|Ko)\.php$/u.test(name))
  .sort();
if (files.length === 0) throw new Error(`No supported MediaWiki message files found in ${inputDirectory}`);

const categoryNamespaces = new Set<string>();
const defaultsortMagicWords = new Set<string>();
const behaviorSwitches: Record<string, Set<string>> = {};

for (const file of files) {
  const source = await readFile(resolve(inputDirectory, file), "utf8");
  const namespaceNames = arrayBlock(source, "namespaceNames");
  const category = /NS_CATEGORY\s*=>\s*'((?:\\'|[^'])*)'/u.exec(namespaceNames)?.[1];
  if (category) categoryNamespaces.add(phpString(category));

  const namespaceAliases = arrayBlock(source, "namespaceAliases");
  for (const match of namespaceAliases.matchAll(/'((?:\\'|[^'])*)'\s*=>\s*NS_CATEGORY\b/gu)) {
    categoryNamespaces.add(phpString(match[1] ?? ""));
  }

  const magicWords = arrayBlock(source, "magicWords");
  for (const match of magicWords.matchAll(/'([^']+)'\s*=>\s*\[([\s\S]*?)\],/gu)) {
    const id = match[1] ?? "";
    const aliases = quotedValues(match[2] ?? "").filter((alias) => alias !== "0" && alias !== "1");
    if (id === "defaultsort") aliases.forEach((alias) => defaultsortMagicWords.add(alias));
    if (behaviorIds.has(id)) {
      behaviorSwitches[id] ??= new Set<string>();
      aliases.forEach((alias) => behaviorSwitches[id]!.add(alias));
    }
  }
}

const generated = {
  source: "MediaWiki core languages/messages/Messages*.php",
  languages: files.map((file) => file.slice("Messages".length, -".php".length)),
  categoryNamespaces: [...categoryNamespaces].sort(),
  defaultsortMagicWords: [...defaultsortMagicWords].sort(),
  behaviorSwitches: Object.fromEntries(
    Object.entries(behaviorSwitches).sort(([a], [b]) => a.localeCompare(b)).map(([id, aliases]) => [
      id,
      [...aliases].sort(),
    ]),
  ),
};

await writeFile(outputPath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");

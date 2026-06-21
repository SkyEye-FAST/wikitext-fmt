import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import Parser, { type Config, type ConfigData } from "wikiparser-node";

const require = createRequire(import.meta.url);

function loadConfig(name: string): ConfigData {
  const mappedName = name === "mediawiki" ? "default" : name;
  if (
    isAbsolute(mappedName) ||
    mappedName.endsWith(".json") ||
    mappedName.includes("/")
  ) {
    return JSON.parse(readFileSync(resolve(mappedName), "utf8")) as ConfigData;
  }

  const packageRoot = dirname(require.resolve("wikiparser-node/package.json"));
  const filename = resolve(packageRoot, "config", `${mappedName}.json`);
  return JSON.parse(readFileSync(filename, "utf8")) as ConfigData;
}

export function getParserConfig(name: string): Config {
  return Parser.getConfig(loadConfig(name));
}

export function parseWikitext(source: string, config: Config) {
  return Parser.parse(source, false, undefined, config);
}

export function isRoundTripSafe(source: string, config: Config): boolean {
  return parseWikitext(source, config).toString() === source;
}

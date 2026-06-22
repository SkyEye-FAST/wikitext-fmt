import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import Parser, { type Config, type ConfigData } from "wikiparser-node";
import bundledDefaultConfig from "wikiparser-node/config/default.json" with { type: "json" };

const require = createRequire(import.meta.url);

interface ConfigLoaderDependencies {
  readFile(filename: string): string;
  resolvePackageJson(): string;
}

const defaultConfigLoaderDependencies: ConfigLoaderDependencies = {
  readFile: (filename) => readFileSync(filename, "utf8"),
  resolvePackageJson: () => require.resolve("wikiparser-node/package.json"),
};

function loadConfig(
  name: string,
  dependencies: ConfigLoaderDependencies = defaultConfigLoaderDependencies,
): ConfigData {
  const mappedName = name === "mediawiki" ? "default" : name;
  if (
    isAbsolute(mappedName) ||
    mappedName.endsWith(".json") ||
    mappedName.includes("/")
  ) {
    return JSON.parse(dependencies.readFile(resolve(mappedName))) as ConfigData;
  }

  let packageRoot: string;
  try {
    packageRoot = dirname(dependencies.resolvePackageJson());
  } catch (error) {
    if (mappedName === "default") {
      return bundledDefaultConfig as unknown as ConfigData;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Named parser config "${name}" requires wikiparser-node config assets or an explicit JSON config path: ${message}`,
    );
  }

  const filename = resolve(packageRoot, "config", `${mappedName}.json`);
  return JSON.parse(dependencies.readFile(filename)) as ConfigData;
}

export function loadParserConfigDataForTesting(
  name: string,
  dependencies: ConfigLoaderDependencies,
): ConfigData {
  return loadConfig(name, dependencies);
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

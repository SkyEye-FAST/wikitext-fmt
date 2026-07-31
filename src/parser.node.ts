import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

import Parser, { type Config, type ConfigData } from "wikiparser-node";
import bundledDefaultConfig from "wikiparser-node/config/default.json" with { type: "json" };

import {
  createParserRuntime,
  createParserSession,
  type ParserImplementation,
  type ParserRuntime,
} from "./parserRuntime.js";

const require = createRequire(import.meta.url);

interface ConfigLoaderDependencies {
  readFile(filename: string): string;
  resolvePackageJson(): string;
}

const defaultConfigLoaderDependencies: ConfigLoaderDependencies = {
  readFile: (filename) => readFileSync(filename, "utf8"),
  resolvePackageJson: () => require.resolve("wikiparser-node/package.json"),
};

const nodeParserImplementation: ParserImplementation = {
  parse: (source, config) => Parser.parse(source, false, undefined, config),
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

export function createNodeParserRuntime(
  dependencies: ConfigLoaderDependencies = defaultConfigLoaderDependencies,
): ParserRuntime {
  return createParserRuntime(nodeParserImplementation, (name) =>
    Parser.getConfig(loadConfig(name, dependencies)),
  );
}

export const nodeParserRuntime = createNodeParserRuntime();

export const createNodeParserSession = (config: Config) =>
  createParserSession(nodeParserImplementation, config);

export const getParserConfig = (name: string): Config =>
  nodeParserRuntime.createSession(name).config;

export const parseWikitext = (source: string, config: Config) =>
  createNodeParserSession(config).parse(source);

export const isRoundTripSafe = (source: string, config: Config): boolean =>
  createNodeParserSession(config).isRoundTripSafe(source);

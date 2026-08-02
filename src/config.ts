import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve } from "node:path";

import type { FormatOptions } from "./options.js";
import {
  type ProjectConfig,
  validateProjectConfig,
} from "./projectConfig.js";

export { validateProjectConfig } from "./projectConfig.js";

export const CONFIG_FILENAMES = [
  ".wikitextfmtrc",
  ".wikitextfmtrc.json",
  "wikitext-fmt.config.json",
] as const;

export interface ConfigResolutionOptions {
  configPath?: string;
  noConfig?: boolean;
  cwd?: string;
}

export interface ResolvedCliConfig {
  options: ProjectConfig;
  projectConfig: ProjectConfig;
  path?: string;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function discoverConfig(
  startDirectory = process.cwd(),
): Promise<string | undefined> {
  let directory = resolve(startDirectory);
  const root = parse(directory).root;
  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = resolve(directory, filename);
      if (await isFile(candidate)) return candidate;
    }
    if (directory === root) return undefined;
    directory = dirname(directory);
  }
}

export function validateConfig(value: unknown): ProjectConfig {
  return validateProjectConfig(value);
}

function resolveParserConfigPath(value: string, baseDirectory: string): string {
  if (
    isAbsolute(value) ||
    (!value.startsWith(".") && !value.includes("/") && !value.endsWith(".json"))
  ) {
    return value;
  }
  return resolve(baseDirectory, value);
}

function resolveProjectConfigPaths(
  config: ProjectConfig,
  path: string,
): ProjectConfig {
  const baseDirectory = dirname(resolve(path));
  return {
    ...config,
    ...(config.parserConfig
      ? { parserConfig: resolveParserConfigPath(config.parserConfig, baseDirectory) }
      : {}),
    ...(config.site
      ? {
          site: {
            ...config.site,
            ...(config.site.parserConfig
              ? {
                  parserConfig: resolveParserConfigPath(
                    config.site.parserConfig,
                    baseDirectory,
                  ),
                }
              : {}),
            ...(config.site.snapshotPath
              ? { snapshotPath: resolve(baseDirectory, config.site.snapshotPath) }
              : {}),
            ...(config.site.cachePath
              ? { cachePath: resolve(baseDirectory, config.site.cachePath) }
              : {}),
          },
        }
      : {}),
  };
}

export async function loadProjectConfig(path: string): Promise<ProjectConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read configuration ${path}: ${message}`);
  }
  try {
    return resolveProjectConfigPaths(validateProjectConfig(parsed), path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid configuration ${path}: ${message}`);
  }
}

export async function loadConfig(path: string): Promise<ProjectConfig> {
  return loadProjectConfig(path);
}

export async function resolveCliConfig(
  cliOptions: FormatOptions,
  resolution: ConfigResolutionOptions = {},
): Promise<ResolvedCliConfig> {
  const cwd = resolve(resolution.cwd ?? process.cwd());
  if (resolution.noConfig) {
    return { options: { ...cliOptions }, projectConfig: {} };
  }
  const path = resolution.configPath
    ? isAbsolute(resolution.configPath)
      ? resolution.configPath
      : resolve(cwd, resolution.configPath)
    : await discoverConfig(cwd);
  if (!path) return { options: { ...cliOptions }, projectConfig: {} };
  if (!(await isFile(path)))
    throw new Error(`Configuration file not found: ${path}`);
  const configOptions = await loadProjectConfig(path);
  return {
    options: { ...configOptions, ...cliOptions },
    projectConfig: configOptions,
    path,
  };
}

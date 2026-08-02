#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import { stderr, stdin, stdout } from "node:process";

import {
  type CliOptions,
  formatterOptions,
  parseArgs,
  usage,
} from "./cli/args.js";
import { resolveCliConfig } from "./cli/config.js";
import {
  createDiagnosticsRecord,
  type FileDiagnostics,
  serializeDiagnostics,
} from "./cli/diagnostics.js";
import { createUnifiedDiff } from "./cli/diff.js";
import {
  resolvedLocalizationAliasesJson,
} from "./cli/localization.js";
import { expandInputPaths } from "./cli/paths.js";
import { createBatchReport } from "./cli/report.js";
import {
  type FormatDetailedResult,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
} from "./formatter.js";
import { type FormatOptions, resolveOptions } from "./options.js";
import type { ResolvedSiteConfiguration } from "./projectConfig.js";
import type { ProjectConfig, SiteConfiguration } from "./projectConfig.js";
import {
  compareParserConfigs,
  generateSiteParserConfig,
  readParserConfigFile,
  serializeGeneratedParserConfig,
  writeGeneratedParserConfig,
} from "./parserConfigGeneration.js";
import {
  resolveProjectConfiguration,
  type ResolvedProjectConfiguration,
} from "./siteConfiguration.js";

const packageMetadata = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function writeReport(
  path: string | undefined,
  files: FileDiagnostics[],
): Promise<boolean> {
  if (!path) return true;
  try {
    await writeFile(
      path,
      `${JSON.stringify(createBatchReport(files), null, 2)}\n`,
      "utf8",
    );
    return true;
  } catch (error) {
    stderr.write(
      `Could not write report ${path}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
    return false;
  }
}

function runFormatter(
  source: string,
  safe: boolean,
  formatOptions: FormatOptions,
): FormatDetailedResult {
  return safe
    ? formatWikitextSafeDetailed(source, formatOptions)
    : formatWikitextDetailedResult(source, formatOptions);
}

function useSafeFormatting(
  options: CliOptions,
  formatOptions: FormatOptions,
): boolean {
  if (options.unsafe) return false;
  if (options.safe) return true;
  const profile = resolveOptions(formatOptions).profile;
  return profile === "production";
}

function isJsonConfigPath(value: string | undefined): value is string {
  return Boolean(value && (isAbsolute(value) || value.includes("/") || value.endsWith(".json")));
}

function generationConfiguration(
  projectConfig: ProjectConfig,
  formatterOverrides: FormatOptions,
  options: CliOptions,
): { generation: NonNullable<SiteConfiguration["parserConfigGeneration"]>; apiUrl: string; outputPath: string } {
  const site = {
    ...projectConfig.site,
    ...(options.siteApi ? { apiUrl: options.siteApi } : {}),
  };
  const generation = site.parserConfigGeneration;
  if (!generation) {
    throw new Error("Parser-config generation requires site.parserConfigGeneration in the project configuration");
  }
  if (!site.apiUrl) {
    throw new Error("Parser-config generation requires site.apiUrl or --site-api");
  }
  const parserConfig =
    formatterOverrides.parserConfig ?? projectConfig.parserConfig ?? site.parserConfig;
  const outputPath = generation.outputPath ??
    (isJsonConfigPath(parserConfig) ? parserConfig : undefined);
  if (!outputPath) {
    throw new Error(
      "site.parserConfigGeneration.outputPath is required unless site.parserConfig is an explicit JSON path",
    );
  }
  return {
    generation,
    apiUrl: site.apiUrl,
    outputPath: resolve(outputPath),
  };
}

async function runParserConfigGenerationMode(
  options: CliOptions,
  projectConfig: ProjectConfig,
  formatterOverrides: FormatOptions,
): Promise<void> {
  const configured = generationConfiguration(projectConfig, formatterOverrides, options);
  const generated = await generateSiteParserConfig({
    apiUrl: configured.apiUrl,
    scriptPath: configured.generation.scriptPath,
    outputPath: configured.outputPath,
    timeoutMilliseconds: configured.generation.timeoutMilliseconds,
    maxModuleBytes: configured.generation.maxModuleBytes,
  });
  for (const diagnostic of generated.diagnostics) {
    stderr.write(`warning: ${diagnostic}\n`);
  }
  if (options.printParserConfig) {
    stdout.write(serializeGeneratedParserConfig(generated.configData));
    return;
  }
  if (options.checkParserConfig) {
    const parserConfig =
      formatterOverrides.parserConfig ??
      projectConfig.parserConfig ??
      projectConfig.site?.parserConfig;
    if (!isJsonConfigPath(parserConfig)) {
      throw new Error(
        "--check-parser-config requires site.parserConfig or --parser-config to be an explicit JSON path",
      );
    }
    const current = await readParserConfigFile(resolve(parserConfig));
    const comparison = compareParserConfigs(current, generated.configData);
    if (!comparison.equal) {
      stdout.write(`${comparison.diff}\n`);
      process.exitCode = 1;
    }
    return;
  }
  const paths = await writeGeneratedParserConfig(configured.outputPath, generated, {
    force: options.forceParserConfig,
  });
  stdout.write(
    `${JSON.stringify(
      {
        outputPath: paths.outputPath,
        provenancePath: paths.provenancePath,
        apiUrl: generated.provenance.apiUrl,
        scriptPath: generated.provenance.scriptPath,
        configSha256: generated.provenance.configSha256,
      },
      null,
      2,
    )}\n`,
  );
}

function debugResult(
  label: string,
  source: string,
  result: FormatDetailedResult,
  options: CliOptions,
  safe: boolean,
  formatOptions: FormatOptions,
  siteConfiguration: ResolvedSiteConfiguration,
  configPath?: string,
): void {
  if (!options.debug) return;
  const level = resolveOptions(formatOptions).level;
  const mode = safe ? "safe" : "unsafe";
  const status = result.warning
    ? "fallback"
    : result.formatted === source
      ? "unchanged"
      : "changed";
  const config = configPath ? ` config=${configPath}` : " config=defaults";
  const site = [
    `site=${siteConfiguration.source}`,
    `parser=${siteConfiguration.parserConfig}`,
    `stale=${siteConfiguration.stale}`,
    siteConfiguration.apiUrl ? `api=${siteConfiguration.apiUrl}` : undefined,
    siteConfiguration.snapshotPath
      ? `snapshot=${siteConfiguration.snapshotPath}`
      : undefined,
    siteConfiguration.cachePath
      ? `cache=${siteConfiguration.cachePath}`
      : undefined,
    siteConfiguration.fetchedAt
      ? `fetchedAt=${siteConfiguration.fetchedAt}`
      : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  stderr.write(
    `${label}: debug: mode=${mode} level=${level} status=${status}${config} ${site}\n`,
  );
  for (const diagnostic of result.tableDiagnostics) {
    const style = diagnostic.separatorStyle
      ? ` using ${diagnostic.separatorStyle} style`
      : "";
    const styleReason = diagnostic.separatorStyleReason
      ? `: ${diagnostic.separatorStyleReason}`
      : "";
    const outcome = diagnostic.changed
      ? `formatted${style}${styleReason}`
      : diagnostic.ambiguous
        ? `skipped as ambiguous: ${diagnostic.reason ?? "unknown reason"}`
        : `unchanged${style}: ${diagnostic.reason ?? "already canonical"}`;
    stderr.write(`${label}: table at line ${diagnostic.line} ${outcome}\n`);
  }
}

function reportDiagnostics(
  label: string,
  source: string,
  result: FormatDetailedResult,
  options: CliOptions,
  safe: boolean,
  formatOptions: FormatOptions,
  siteConfiguration: ResolvedSiteConfiguration,
  configPath?: string,
): void {
  if (options.diagnosticsJson) {
    stderr.write(
      `${serializeDiagnostics(label, source, result, siteConfiguration)}\n`,
    );
    return;
  }
  debugResult(
    label,
    source,
    result,
    options,
    safe,
    formatOptions,
    siteConfiguration,
    configPath,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--version") || args.includes("-v")) {
    stdout.write(`${packageMetadata.version}\n`);
    return;
  }

  let options: CliOptions;
  try {
    options = parseArgs(args);
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n${usage()}\n`,
    );
    process.exitCode = 2;
    return;
  }

  let formatOptions: FormatOptions;
  let configPath: string | undefined;
  let projectResolution: ResolvedProjectConfiguration;
  try {
    const cliFormatOptions = formatterOptions(options);
    const resolved = await resolveCliConfig(cliFormatOptions, {
      configPath: options.configPath,
      noConfig: options.noConfig,
    });
    if (
      options.generateParserConfig ||
      options.checkParserConfig ||
      options.printParserConfig
    ) {
      await runParserConfigGenerationMode(
        options,
        resolved.projectConfig,
        cliFormatOptions,
      );
      return;
    }
    projectResolution = await resolveProjectConfiguration({
      projectConfig: resolved.projectConfig,
      formatterOverrides: cliFormatOptions,
      siteOverrides: {
        ...(options.siteApi ? { apiUrl: options.siteApi } : {}),
        ...(options.siteSnapshot ? { snapshotPath: options.siteSnapshot } : {}),
      },
      refresh: options.refreshSiteConfiguration,
    });
    formatOptions = projectResolution.options;
    configPath = resolved.path;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  if (!options.diagnosticsJson) {
    for (const diagnostic of projectResolution.siteConfiguration.diagnostics) {
      stderr.write(`warning: ${diagnostic}\n`);
    }
  }

  if (options.printLocalizationAliases) {
    stdout.write(resolvedLocalizationAliasesJson(formatOptions));
    return;
  }
  if (
    options.printSiteConfiguration ||
    options.validateSiteConfiguration ||
    (options.refreshSiteConfiguration && !options.stdin && options.files.length === 0)
  ) {
    stdout.write(
      `${JSON.stringify(
        {
          siteConfiguration: projectResolution.siteConfiguration,
          options: projectResolution.options,
          ...(projectResolution.snapshot
            ? { snapshot: projectResolution.snapshot }
            : {}),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  const safe = useSafeFormatting(options, formatOptions);

  if (options.stdin) {
    const source = await readStdin();
    const result = runFormatter(source, safe, formatOptions);
    const diagnostics = createDiagnosticsRecord(
      "stdin",
      source,
      result,
      projectResolution.siteConfiguration,
    );
    reportDiagnostics(
      "stdin",
      source,
      result,
      options,
      safe,
      formatOptions,
      projectResolution.siteConfiguration,
      configPath,
    );
    if (result.warning && !options.diagnosticsJson)
      stderr.write(`warning: ${result.warning}\n`);
    if (options.diff)
      stdout.write(createUnifiedDiff("stdin", source, result.formatted));
    else if (options.check)
      process.exitCode = result.formatted === source ? 0 : 1;
    else stdout.write(result.formatted);
    if (options.diff && result.formatted !== source) process.exitCode = 1;
    if (options.failOnWarning && result.failure) process.exitCode = 1;
    await writeReport(options.reportPath, [diagnostics]);
    return;
  }

  let files: string[];
  try {
    files = await expandInputPaths(options.files);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }

  let changed = false;
  let failed = false;
  const diagnostics: FileDiagnostics[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const result = runFormatter(source, safe, formatOptions);
    diagnostics.push(
      createDiagnosticsRecord(
        file,
        source,
        result,
        projectResolution.siteConfiguration,
      ),
    );
    reportDiagnostics(
      file,
      source,
      result,
      options,
      safe,
      formatOptions,
      projectResolution.siteConfiguration,
      configPath,
    );
    if (result.warning && !options.diagnosticsJson)
      stderr.write(`${file}: warning: ${result.warning}\n`);
    if (result.failure) failed = true;
    if (result.formatted !== source) changed = true;
    if (options.write) await writeFile(file, result.formatted, "utf8");
    else if (options.diff)
      stdout.write(createUnifiedDiff(file, source, result.formatted));
    else if (!options.check) stdout.write(result.formatted);
  }
  if ((options.check || options.diff) && changed) process.exitCode = 1;
  if (options.failOnWarning && failed) process.exitCode = 1;
  await writeReport(options.reportPath, diagnostics);
}

await main();

#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import fg from "fast-glob";

import { formatWikitextSafeDetailed } from "../dist/index.js";
import { measureDiffQuality } from "../dist/cli/diff.js";
import { getParserConfig, parseWikitext } from "../dist/parser.js";

function percentage(numerator, denominator) {
  return denominator === 0
    ? null
    : Number(((numerator / denominator) * 100).toFixed(2));
}

function belowThreshold(actual, minimum) {
  return actual === null ? minimum > 0 : actual < minimum;
}

function threshold(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${option} must be a number from 0 through 100`);
  }
  return parsed;
}

function ratioThreshold(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${option} must be a number from 0 through 1`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    directory: undefined,
    parserConfig: undefined,
    profile: undefined,
    output: undefined,
    siteinfo: undefined,
    noManifest: false,
    minTemplateCoverage: 0,
    minTableCoverage: 0,
    maxP95DiffRatio: undefined,
    maxSinglePageDiffRatio: undefined,
    allowedSkipReasons: [],
    progress: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--parser-config") options.parserConfig = argv[++index];
    else if (arg === "--profile") options.profile = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--siteinfo") options.siteinfo = argv[++index];
    else if (arg === "--no-manifest") options.noManifest = true;
    else if (arg === "--min-template-coverage") {
      options.minTemplateCoverage = threshold(argv[++index], arg);
    } else if (arg === "--min-table-coverage") {
      options.minTableCoverage = threshold(argv[++index], arg);
    } else if (arg === "--max-p95-diff-ratio") {
      options.maxP95DiffRatio = ratioThreshold(argv[++index], arg);
    } else if (arg === "--max-single-page-diff-ratio") {
      options.maxSinglePageDiffRatio = ratioThreshold(argv[++index], arg);
    } else if (arg === "--allow-skip-reason") {
      options.allowedSkipReasons.push(argv[++index]);
    } else if (arg === "--progress") {
      options.progress = true;
    } else if (arg?.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else if (!options.directory) options.directory = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.directory) {
    throw new Error(
      "Usage: run-corpus.mjs <directory> [--parser-config name-or-path] [--profile production|aggressive] [--siteinfo normalized-aliases.json] [--no-manifest] [--output report.json] [--min-template-coverage 0..100] [--min-table-coverage 0..100] [--max-p95-diff-ratio 0..1] [--max-single-page-diff-ratio 0..1] [--allow-skip-reason exact-reason]",
    );
  }
  if (
    options.profile !== undefined &&
    options.profile !== "production" &&
    options.profile !== "aggressive"
  ) {
    throw new Error("Corpus profile must be production or aggressive");
  }
  if (options.allowedSkipReasons.some((reason) => !reason)) {
    throw new Error("--allow-skip-reason requires a non-empty exact reason");
  }
  return options;
}

function increment(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(
    sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
    ].toFixed(3),
  );
}

async function corpusMetadata(directory, manifest) {
  const referenced = manifest?.metadata?.pages;
  if (referenced !== undefined && typeof referenced !== "string") {
    throw new Error("Corpus manifest metadata.pages must be a file reference");
  }
  const filename = resolve(directory, referenced ?? "metadata/pages.json");
  try {
    const pages = JSON.parse(await readFile(filename, "utf8"));
    if (!Array.isArray(pages)) {
      throw new Error("page metadata root value must be an array");
    }
    return new Map(
      pages.map((page) => [resolve(directory, page.sourceFile), page]),
    );
  } catch (error) {
    if (error?.code === "ENOENT" && referenced === undefined) return new Map();
    throw new Error(
      `Corpus page metadata is missing or malformed at ${filename}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonFile(filename, description) {
  let source;
  try {
    source = await readFile(filename, "utf8");
  } catch (error) {
    throw new Error(
      `${description} is missing or unreadable at ${filename}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(
      `${description} is malformed JSON at ${filename}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function loadManifest(directory, disabled) {
  if (disabled) return null;
  const filename = resolve(directory, "manifest.json");
  try {
    const manifest = JSON.parse(await readFile(filename, "utf8"));
    if (!isRecord(manifest)) throw new Error("root value must be an object");
    return manifest;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(
      `Corpus manifest is malformed at ${filename}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function manifestParserConfig(manifest, directory) {
  if (!manifest?.parserConfig) return undefined;
  if (typeof manifest.parserConfig === "string") return manifest.parserConfig;
  if (
    isRecord(manifest.parserConfig) &&
    typeof manifest.parserConfig.file === "string"
  ) {
    return resolve(directory, manifest.parserConfig.file);
  }
  throw new Error(
    "Corpus manifest parserConfig must be a name or file reference",
  );
}

function normalizedAliasObject(value, description) {
  const aliases = value?.localizationAliases ?? value;
  if (!isRecord(aliases) || isRecord(aliases.query)) {
    throw new Error(
      `${description} must contain normalized FormatOptions.localizationAliases, not raw MediaWiki siteinfo`,
    );
  }
  for (const key of [
    "categoryNamespaces",
    "fileNamespaces",
    "defaultsortMagicWords",
    "redirectMagicWords",
  ]) {
    if (aliases[key] !== undefined && !Array.isArray(aliases[key])) {
      throw new Error(`${description} has a malformed ${key} field`);
    }
  }
  for (const key of ["imageOptionAliases", "behaviorSwitches"]) {
    if (aliases[key] !== undefined && !isRecord(aliases[key])) {
      throw new Error(`${description} has a malformed ${key} field`);
    }
  }
  return aliases;
}

async function localizationOptions(
  siteinfoPath,
  description = "Localization aliases",
) {
  if (!siteinfoPath) return {};
  const filename = resolve(siteinfoPath);
  const parsed = await readJsonFile(filename, description);
  const aliases = normalizedAliasObject(parsed, description);
  return { localizationSource: "custom", localizationAliases: aliases };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const directory = resolve(args.directory);
  const manifest = await loadManifest(directory, args.noManifest);
  if (manifest?.metadata !== undefined && !isRecord(manifest.metadata)) {
    throw new Error("Corpus manifest metadata must be an object");
  }
  const parserConfig =
    args.parserConfig ??
    manifestParserConfig(manifest, directory) ??
    "mediawiki";
  const profile = args.profile ?? "production";
  const files = await fg("**/*.wiki", { cwd: directory, absolute: true });
  files.sort();
  const parser = getParserConfig(parserConfig);
  const manifestAliases = manifest?.metadata?.localizationAliases;
  if (
    manifest?.metadata?.localizationAliases !== undefined &&
    typeof manifestAliases !== "string"
  ) {
    throw new Error(
      "Corpus manifest metadata.localizationAliases must be a file reference",
    );
  }
  const localization = await localizationOptions(
    args.siteinfo ??
      (manifestAliases ? resolve(directory, manifestAliases) : undefined),
    args.siteinfo
      ? "Explicit localization aliases"
      : "Manifest localization aliases",
  );
  const metadata = await corpusMetadata(directory, manifest);
  const pageTimings = [];
  const report = {
    directory,
    manifest: manifest
      ? {
          schemaVersion: manifest.schemaVersion ?? null,
          tier: manifest.tier ?? null,
          namespaces: manifest.namespaces ?? null,
          source: manifest.source ?? null,
        }
      : null,
    parserConfig,
    profile,
    thresholds: {
      minimumTemplateCoveragePercentage: args.minTemplateCoverage,
      minimumTableCoveragePercentage: args.minTableCoverage,
      maximumP95DiffRatio: args.maxP95DiffRatio ?? null,
      maximumSinglePageDiffRatio: args.maxSinglePageDiffRatio ?? null,
      allowedSkipReasons: args.allowedSkipReasons,
    },
    pagesProcessed: 0,
    pagesInCorpus: files.length,
    pagesSkippedNonWikitext: 0,
    pagesAssumedWikitext: 0,
    pagesChanged: 0,
    changedPagePercentage: null,
    pagesWithStructuralNodes: 0,
    pagesWithoutStructuralNodes: 0,
    pagesStructurallyEligible: 0,
    pagesStructurallyCovered: 0,
    pageStructuralCoveragePercentage: null,
    pageCoveragePercentage: null,
    templatePagesWithNodes: 0,
    templatePagesCovered: 0,
    templatePageCoveragePercentage: null,
    tablePagesWithNodes: 0,
    tablePagesCovered: 0,
    tablePageCoveragePercentage: null,
    structuralNodesEligible: 0,
    structuralNodesCovered: 0,
    nodeStructuralCoveragePercentage: null,
    totalBytes: 0,
    totalCorpusBytes: 0,
    totalBytesBefore: 0,
    totalBytesAfter: 0,
    totalLinesBefore: 0,
    totalLinesAfter: 0,
    changedLines: 0,
    changedByteCount: 0,
    pagesChangedOnlyByLineEndings: 0,
    pagesChangedOnlyByTrailingWhitespace: 0,
    pagesChangedStructurally: 0,
    diffRatio: {
      p50: null,
      p95: null,
      p99: null,
      maximum: null,
    },
    namespaceDistribution: {},
    contentModelDistribution: {},
    warnings: 0,
    parseFailures: 0,
    idempotencyFailures: 0,
    equivalenceFailures: 0,
    convergenceLimitReached: 0,
    templatesInspected: 0,
    templatesEligible: 0,
    templatesChanged: 0,
    uniqueTemplatesFormatted: 0,
    templatesAlreadyCanonical: 0,
    templatesSkippedAmbiguous: 0,
    templateCoveragePercentage: null,
    wikilinksInspected: 0,
    wikilinksEligible: 0,
    wikilinksChanged: 0,
    wikilinkUnderscoresReplaced: 0,
    wikilinksWithFragmentsChanged: 0,
    wikilinksSkippedUnsafe: 0,
    wikilinkSkipReasons: {},
    tablesInspected: 0,
    tablesEligible: 0,
    tablesChanged: 0,
    tablesFormatted: 0,
    tablesAlreadyCanonical: 0,
    tablesSkippedAmbiguous: 0,
    tableCoveragePercentage: null,
    skipReasons: {},
    unexplainedSkipReasons: {},
    skipDetails: [],
    timingMilliseconds: {
      total: 0,
      p50: null,
      p95: null,
      p99: null,
      maximum: null,
    },
    largestPages: [],
    largestDiffs: [],
    pageDiffs: [],
    slowestPages: [],
    nonWikitextSkips: [],
    failures: [],
  };
  const pageDiffRatios = [];

  for (const [fileIndex, file] of files.entries()) {
    if (args.progress) {
      process.stderr.write(
        `corpus: ${fileIndex + 1}/${files.length} ${relative(directory, file)}\n`,
      );
    }
    const source = await readFile(file, "utf8");
    const bytes = Buffer.byteLength(source);
    const pageMetadata = metadata.get(file);
    const hasContentModel =
      typeof pageMetadata?.contentModel === "string" &&
      pageMetadata.contentModel.length > 0;
    const contentModel = hasContentModel
      ? pageMetadata.contentModel
      : "wikitext";
    const pageIdentity = {
      file: relative(directory, file),
      ...(pageMetadata?.title ? { title: pageMetadata.title } : {}),
      ...(Number.isSafeInteger(pageMetadata?.namespace)
        ? { namespace: pageMetadata.namespace }
        : {}),
      contentModel,
      bytes,
    };
    report.totalCorpusBytes += bytes;
    increment(report.contentModelDistribution, contentModel);
    if (!hasContentModel) report.pagesAssumedWikitext++;
    if (contentModel.toLowerCase() !== "wikitext") {
      report.pagesSkippedNonWikitext++;
      report.nonWikitextSkips.push(pageIdentity);
      continue;
    }
    report.totalBytes += bytes;
    report.totalBytesBefore += bytes;
    increment(
      report.namespaceDistribution,
      Number.isSafeInteger(pageMetadata?.namespace)
        ? String(pageMetadata.namespace)
        : "unknown",
    );
    report.largestPages.push(pageIdentity);
    report.pagesProcessed++;
    try {
      parseWikitext(source, parser);
    } catch (error) {
      const diff = measureDiffQuality(source, source);
      report.totalBytesAfter += diff.bytesAfter;
      report.totalLinesBefore += diff.linesBefore;
      report.totalLinesAfter += diff.linesAfter;
      report.pageDiffs.push({ ...pageIdentity, ...diff });
      report.parseFailures++;
      report.failures.push({ file, kind: "parse", message: String(error) });
      continue;
    }
    const options = {
      profile,
      parserConfig,
      ...localization,
    };
    const formattingStarted = performance.now();
    const result = formatWikitextSafeDetailed(source, options);
    const formattingMilliseconds = performance.now() - formattingStarted;
    pageTimings.push(formattingMilliseconds);
    report.slowestPages.push({
      ...pageIdentity,
      milliseconds: Number(formattingMilliseconds.toFixed(3)),
    });
    if (result.formatted !== source) report.pagesChanged++;
    const diff = measureDiffQuality(source, result.formatted);
    report.totalBytesAfter += diff.bytesAfter;
    report.totalLinesBefore += diff.linesBefore;
    report.totalLinesAfter += diff.linesAfter;
    report.changedLines += diff.changedLines;
    report.changedByteCount += diff.changedBytes;
    pageDiffRatios.push(diff.diffRatio);
    report.pageDiffs.push({ ...pageIdentity, ...diff });
    if (diff.lineEndingsOnly) report.pagesChangedOnlyByLineEndings++;
    if (diff.trailingWhitespaceOnly)
      report.pagesChangedOnlyByTrailingWhitespace++;
    if (result.warning) {
      report.warnings++;
      report.failures.push({
        file,
        kind: "warning",
        code: result.failure?.code ?? null,
        message: result.warning,
      });
    }
    const equivalenceFailures = result.equivalenceDiagnostics.filter(
      (entry) => !entry.equivalent,
    );
    report.equivalenceFailures += equivalenceFailures.length;
    for (const failure of equivalenceFailures) {
      report.failures.push({
        file,
        kind: "equivalence",
        message: failure.reason ?? `${failure.structure} fingerprint changed`,
      });
    }

    const templates = result.templateDiagnostics;
    report.templatesInspected += templates.templatesInspected;
    report.templatesEligible += templates.templatesEligible;
    report.templatesChanged += templates.templatesChanged;
    report.uniqueTemplatesFormatted += templates.uniqueTemplatesFormatted;
    report.templatesAlreadyCanonical += templates.templatesAlreadyCanonical;
    report.templatesSkippedAmbiguous += templates.templatesSkippedAmbiguous;
    const wikilinks = result.wikilinkDiagnostics;
    report.wikilinksInspected += wikilinks.wikilinksInspected;
    report.wikilinksEligible += wikilinks.wikilinksEligible;
    report.wikilinksChanged += wikilinks.wikilinksFormatted;
    report.wikilinkUnderscoresReplaced += wikilinks.underscoresReplaced;
    report.wikilinksWithFragmentsChanged +=
      wikilinks.wikilinksWithFragmentsFormatted;
    report.wikilinksSkippedUnsafe += wikilinks.wikilinksSkippedUnsafe;
    for (const [reason, count] of Object.entries(wikilinks.skipReasons)) {
      increment(report.wikilinkSkipReasons, reason, count);
    }
    const tables = result.tableFormatDiagnostics;
    report.tablesInspected += tables.tablesInspected;
    report.tablesEligible += tables.tablesEligible;
    report.tablesChanged += tables.tablesChanged;
    report.tablesFormatted += tables.tablesChanged;
    report.tablesAlreadyCanonical += tables.tablesAlreadyCanonical;
    report.tablesSkippedAmbiguous += tables.tablesSkippedAmbiguous;
    const pageTemplateNodes = templates.templatesInspected;
    const pageTableNodes = tables.tablesInspected;
    const pageHasStructuralNodes = pageTemplateNodes + pageTableNodes > 0;
    const pageEligibleNodes =
      templates.templatesEligible + tables.tablesEligible;
    const pageCoveredNodes =
      templates.templatesChanged +
      templates.templatesAlreadyCanonical +
      tables.tablesChanged +
      tables.tablesAlreadyCanonical;
    report.structuralNodesEligible += pageEligibleNodes;
    report.structuralNodesCovered += pageCoveredNodes;
    if (pageHasStructuralNodes) {
      report.pagesWithStructuralNodes++;
      if (pageEligibleNodes > 0) report.pagesStructurallyEligible++;
      if (
        templates.templatesSkippedAmbiguous === 0 &&
        tables.tablesSkippedAmbiguous === 0 &&
        !result.failure
      ) {
        report.pagesStructurallyCovered++;
      }
    }
    if (pageTemplateNodes > 0) {
      report.templatePagesWithNodes++;
      if (
        templates.templatesSkippedAmbiguous === 0 &&
        !result.failure
      ) {
        report.templatePagesCovered++;
      }
    }
    if (pageTableNodes > 0) {
      report.tablePagesWithNodes++;
      if (tables.tablesSkippedAmbiguous === 0 && !result.failure) {
        report.tablePagesCovered++;
      }
    }
    const pageChangedStructurally =
      templates.templatesChanged > 0 ||
      tables.tablesChanged > 0 ||
      Object.values(result.footerDiagnostics).some((value) => value > 0) ||
      Object.values(result.redirectDiagnostics).some((value) => value > 0) ||
      Object.values(result.fileLinkDiagnostics).some((value) => value > 0) ||
      result.wikilinkDiagnostics.wikilinksFormatted > 0 ||
      Object.values(result.externalLinkDiagnostics).some((value) => value > 0) ||
      Object.values(result.referenceDiagnostics).some((value) => value > 0);
    if (pageChangedStructurally) report.pagesChangedStructurally++;
    if (diff.changedBytes > 0) {
      report.largestDiffs.push({
        ...pageIdentity,
        changedBytes: diff.changedBytes,
        changedLines: diff.changedLines,
        diffRatio: diff.diffRatio,
      });
    }
    if (templates.convergenceLimitReached || tables.convergenceLimitReached) {
      report.convergenceLimitReached++;
      report.failures.push({
        file,
        kind: "convergence",
        message: "a structural formatter reached its convergence limit",
      });
    }

    const pageSkipReasons = [];
    for (const [reason, count] of Object.entries(templates.skipReasons)) {
      increment(report.skipReasons, reason, count);
      pageSkipReasons.push([reason, count]);
      report.skipDetails.push({
        ...pageIdentity,
        kind: "template",
        reason,
        count,
      });
    }
    for (const diagnostic of result.tableDiagnostics) {
      if (diagnostic.ambiguous && diagnostic.reason) {
        increment(report.skipReasons, diagnostic.reason);
        pageSkipReasons.push([diagnostic.reason, 1]);
        report.skipDetails.push({
          ...pageIdentity,
          kind: "table",
          reason: diagnostic.reason,
          count: 1,
          ...(diagnostic.semanticId
            ? { semanticId: diagnostic.semanticId }
            : {}),
          line: diagnostic.line,
          start: diagnostic.start,
          end: diagnostic.end,
        });
      }
    }
    for (const [reason, count] of pageSkipReasons) {
      if (!args.allowedSkipReasons.includes(reason)) {
        increment(report.unexplainedSkipReasons, reason, count);
      }
    }

    if (result.failure?.code === "idempotency") {
      report.idempotencyFailures++;
      report.failures.push({
        file,
        kind: "idempotency",
        message: result.warning,
      });
    }
  }

  report.templateCoveragePercentage = percentage(
    report.templatesChanged + report.templatesAlreadyCanonical,
    report.templatesEligible,
  );
  report.tableCoveragePercentage = percentage(
    report.tablesChanged + report.tablesAlreadyCanonical,
    report.tablesEligible,
  );
  report.pagesWithoutStructuralNodes =
    report.pagesProcessed - report.pagesWithStructuralNodes;
  report.changedPagePercentage = percentage(
    report.pagesChanged,
    report.pagesProcessed,
  );
  report.pageStructuralCoveragePercentage = percentage(
    report.pagesStructurallyCovered,
    report.pagesWithStructuralNodes,
  );
  report.pageCoveragePercentage = report.pageStructuralCoveragePercentage;
  report.templatePageCoveragePercentage = percentage(
    report.templatePagesCovered,
    report.templatePagesWithNodes,
  );
  report.tablePageCoveragePercentage = percentage(
    report.tablePagesCovered,
    report.tablePagesWithNodes,
  );
  report.nodeStructuralCoveragePercentage = percentage(
    report.structuralNodesCovered,
    report.structuralNodesEligible,
  );
  report.diffRatio = {
    p50: percentile(pageDiffRatios, 0.5),
    p95: percentile(pageDiffRatios, 0.95),
    p99: percentile(pageDiffRatios, 0.99),
    maximum: percentile(pageDiffRatios, 1),
  };
  report.timingMilliseconds = {
    total: Number(
      pageTimings.reduce((sum, value) => sum + value, 0).toFixed(3),
    ),
    p50: percentile(pageTimings, 0.5),
    p95: percentile(pageTimings, 0.95),
    p99: percentile(pageTimings, 0.99),
    maximum: percentile(pageTimings, 1),
  };
  report.largestPages = report.largestPages
    .sort((a, b) => b.bytes - a.bytes || a.file.localeCompare(b.file))
    .slice(0, 10);
  report.slowestPages = report.slowestPages
    .sort(
      (a, b) => b.milliseconds - a.milliseconds || a.file.localeCompare(b.file),
    )
    .slice(0, 10);
  report.largestDiffs = report.largestDiffs
    .sort(
      (a, b) =>
        b.changedBytes - a.changedBytes ||
        b.diffRatio - a.diffRatio ||
        a.file.localeCompare(b.file),
    )
    .slice(0, 10);
  if (
    belowThreshold(report.templateCoveragePercentage, args.minTemplateCoverage)
  ) {
    report.failures.push({
      kind: "template-coverage",
      message: `${report.templateCoveragePercentage ?? "no eligible nodes"} is below the ${args.minTemplateCoverage}% requirement`,
    });
  }
  if (
    args.maxP95DiffRatio !== undefined &&
    (report.diffRatio.p95 ?? 0) > args.maxP95DiffRatio
  ) {
    report.failures.push({
      kind: "p95-diff-ratio",
      message: `${report.diffRatio.p95} exceeds the ${args.maxP95DiffRatio} maximum`,
    });
  }
  if (
    args.maxSinglePageDiffRatio !== undefined &&
    (report.diffRatio.maximum ?? 0) > args.maxSinglePageDiffRatio
  ) {
    report.failures.push({
      kind: "single-page-diff-ratio",
      message: `${report.diffRatio.maximum} exceeds the ${args.maxSinglePageDiffRatio} maximum`,
    });
  }
  if (belowThreshold(report.tableCoveragePercentage, args.minTableCoverage)) {
    report.failures.push({
      kind: "table-coverage",
      message: `${report.tableCoveragePercentage ?? "no eligible nodes"} is below the ${args.minTableCoverage}% requirement`,
    });
  }
  for (const [reason, count] of Object.entries(report.unexplainedSkipReasons)) {
    report.failures.push({
      kind: "unexplained-skip",
      message: `${reason} (${count})`,
    });
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) await writeFile(resolve(args.output), json);
  process.stdout.write(json);
  if (
    report.parseFailures > 0 ||
    report.idempotencyFailures > 0 ||
    report.equivalenceFailures > 0 ||
    report.warnings > 0 ||
    report.convergenceLimitReached > 0 ||
    Object.keys(report.unexplainedSkipReasons).length > 0 ||
    belowThreshold(
      report.templateCoveragePercentage,
      args.minTemplateCoverage,
    ) ||
    belowThreshold(report.tableCoveragePercentage, args.minTableCoverage)
    || (
      args.maxP95DiffRatio !== undefined &&
      (report.diffRatio.p95 ?? 0) > args.maxP95DiffRatio
    )
    || (
      args.maxSinglePageDiffRatio !== undefined &&
      (report.diffRatio.maximum ?? 0) > args.maxSinglePageDiffRatio
    )
  ) {
    process.exitCode = 1;
  }
}

await main();

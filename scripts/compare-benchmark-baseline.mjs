#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveRatio(value, name) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

const reportPath = option("--report");
const baselinePath = option("--baseline");
const outputPath = option("--output");
const maximumTimeRatio = positiveRatio(
  option("--max-time-ratio"),
  "--max-time-ratio",
);
const maximumRssRatio = positiveRatio(
  option("--max-rss-ratio"),
  "--max-rss-ratio",
);
if (!reportPath || !baselinePath) {
  throw new Error(
    "Usage: compare-benchmark-baseline.mjs --report report.json --baseline baseline.json [--output comparison.json] [--max-time-ratio N] [--max-rss-ratio N]",
  );
}

const report = JSON.parse(await readFile(resolve(reportPath), "utf8"));
const baseline = JSON.parse(await readFile(resolve(baselinePath), "utf8"));
if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.cases)) {
  throw new Error("Benchmark baseline must use schemaVersion 1 and contain cases");
}
const baselineCases = new Map(baseline.cases.map((entry) => [entry.name, entry]));
const comparisons = report.cases.map((entry) => {
  const previous = baselineCases.get(entry.name);
  if (!previous) {
    throw new Error(`Benchmark baseline is missing case ${entry.name}`);
  }
  return {
    name: entry.name,
    totalFormattingMilliseconds: entry.totalFormattingMilliseconds,
    baselineFormattingMilliseconds: previous.totalFormattingMilliseconds,
    formattingTimeRatio: Number(
      (
        entry.totalFormattingMilliseconds /
        Math.max(0.001, previous.totalFormattingMilliseconds)
      ).toFixed(3),
    ),
    processPeakRssBytes: entry.memory.processPeakRssBytes,
    baselineProcessPeakRssBytes: previous.processPeakRssBytes,
    processPeakRssRatio: Number(
      (
        entry.memory.processPeakRssBytes /
        Math.max(1, previous.processPeakRssBytes)
      ).toFixed(3),
    ),
  };
});
const failures = [];
for (const comparison of comparisons) {
  if (
    maximumTimeRatio !== undefined &&
    comparison.formattingTimeRatio > maximumTimeRatio
  ) {
    failures.push(
      `${comparison.name} formatting time ratio ${comparison.formattingTimeRatio} exceeds ${maximumTimeRatio}`,
    );
  }
  if (
    maximumRssRatio !== undefined &&
    comparison.processPeakRssRatio > maximumRssRatio
  ) {
    failures.push(
      `${comparison.name} peak RSS ratio ${comparison.processPeakRssRatio} exceeds ${maximumRssRatio}`,
    );
  }
}
const comparison = {
  schemaVersion: 1,
  baselineVersion: baseline.version,
  generatedAt: new Date().toISOString(),
  node: report.node,
  platform: report.platform,
  thresholds: {
    maximumTimeRatio: maximumTimeRatio ?? null,
    maximumRssRatio: maximumRssRatio ?? null,
  },
  comparisons,
  failures,
};
const json = `${JSON.stringify(comparison, null, 2)}\n`;
if (outputPath) await writeFile(resolve(outputPath), json, "utf8");
process.stdout.write(json);
if (failures.length > 0) process.exitCode = 1;

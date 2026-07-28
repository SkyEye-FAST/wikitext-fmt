#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { normalizeSiteInfoPayload } from "../src/localization/siteinfo-normalize.js";

const tierMaximums = { small: 100, medium: 5_000, full: Infinity };

function parseArgs(argv) {
  const options = {
    api: undefined,
    titles: undefined,
    allPages: false,
    xml: undefined,
    output: undefined,
    tier: "small",
    maxPages: undefined,
    namespaces: undefined,
    seed: "wikitext-fmt",
    parserConfig: "mediawiki",
    siteinfo: undefined,
    excludeTitles: [],
    excludeContents: [],
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--api") options.api = argv[++index];
    else if (arg === "--titles") options.titles = argv[++index];
    else if (arg === "--all-pages") options.allPages = true;
    else if (arg === "--xml") options.xml = argv[++index];
    else if (arg === "--output") options.output = argv[++index];
    else if (arg === "--tier") options.tier = argv[++index];
    else if (arg === "--max-pages") options.maxPages = Number(argv[++index]);
    else if (arg === "--namespaces") {
      options.namespaces = new Set(
        argv[++index].split(",").map((value) => Number(value.trim())),
      );
    } else if (arg === "--seed") options.seed = argv[++index];
    else if (arg === "--parser-config") options.parserConfig = argv[++index];
    else if (arg === "--siteinfo") options.siteinfo = argv[++index];
    else if (arg === "--exclude-title-regex") {
      options.excludeTitles.push(new RegExp(argv[++index], "u"));
    } else if (arg === "--exclude-content-regex") {
      options.excludeContents.push(new RegExp(argv[++index], "u"));
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (
    !options.output ||
    (!options.xml && !(options.api && (options.titles || options.allPages)))
  ) {
    throw new Error(
      "Usage: build-target-corpus.mjs (--xml dump.xml | --api URL (--titles titles.txt | --all-pages)) --output directory [--tier small|medium|full] [--max-pages N] [--namespaces 0,10] [--seed text] [--parser-config name-or-path] [--siteinfo file] [--exclude-title-regex pattern] [--exclude-content-regex pattern]",
    );
  }
  if (options.xml && (options.api || options.titles || options.allPages)) {
    throw new Error("--xml and --api/--titles are mutually exclusive");
  }
  if (options.titles && options.allPages) {
    throw new Error("--titles and --all-pages are mutually exclusive");
  }
  if (options.allPages && !options.namespaces) {
    throw new Error("--all-pages requires an explicit --namespaces filter");
  }
  if (!(options.tier in tierMaximums)) {
    throw new Error("--tier must be small, medium, or full");
  }
  if (
    options.maxPages !== undefined &&
    (!Number.isSafeInteger(options.maxPages) || options.maxPages <= 0)
  ) {
    throw new Error("--max-pages must be a positive integer");
  }
  if (
    options.namespaces &&
    [...options.namespaces].some(
      (namespace) => !Number.isSafeInteger(namespace),
    )
  ) {
    throw new Error("--namespaces must contain comma-separated integers");
  }
  return options;
}

function xmlText(value = "") {
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/u.exec(value)?.[1] ?? value;
  return cdata
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function tag(block, name) {
  return xmlText(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "u").exec(
      block,
    )?.[1],
  );
}

function rank(seed, title) {
  return createHash("sha256").update(`${seed}\0${title}`).digest("hex");
}

function includePage(page, options) {
  return (
    (!options.namespaces || options.namespaces.has(page.namespace)) &&
    !options.excludeTitles.some((pattern) => pattern.test(page.title)) &&
    !options.excludeContents.some((pattern) => pattern.test(page.source))
  );
}

function isNormalizedLocalizationAliases(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Array.isArray(value.categoryNamespaces) ||
      Array.isArray(value.fileNamespaces) ||
      Array.isArray(value.defaultsortMagicWords) ||
      Array.isArray(value.redirectMagicWords) ||
      value.imageOptionAliases !== undefined ||
      value.behaviorSwitches !== undefined)
  );
}

function normalizedAliases(value, source) {
  const candidate = value?.localizationAliases ?? value;
  if (isNormalizedLocalizationAliases(candidate)) return candidate;
  return normalizeSiteInfoPayload(value, source);
}

async function pagesFromXml(filename, onPage) {
  let buffer = "";
  for await (const chunk of createReadStream(resolve(filename), {
    encoding: "utf8",
  })) {
    buffer += chunk;
    while (true) {
      const start = buffer.indexOf("<page>");
      if (start < 0) {
        buffer = buffer.slice(-16);
        break;
      }
      const end = buffer.indexOf("</page>", start);
      if (end < 0) {
        buffer = buffer.slice(start);
        break;
      }
      const block = buffer.slice(start, end + "</page>".length);
      const revision =
        /<revision>([\s\S]*?)<\/revision>/u.exec(block)?.[1] ?? "";
      const textMatch = /<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/u.exec(revision);
      await onPage({
        title: tag(block, "title"),
        namespace: Number(tag(block, "ns")),
        pageId: Number(tag(block.slice(0, block.indexOf("<revision>")), "id")),
        revisionId: Number(tag(revision, "id")),
        timestamp: tag(revision, "timestamp") || null,
        contentModel: tag(revision, "model") || "wikitext",
        source: textMatch ? xmlText(textMatch[1]) : "",
        sourceKind: "xml",
      });
      buffer = buffer.slice(end + "</page>".length);
    }
  }
}

async function fetchJson(api, parameters) {
  const url = new URL(api);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: { "user-agent": "wikitext-fmt-read-only-corpus-builder/0.1" },
  });
  if (!response.ok) {
    throw new Error(`MediaWiki API GET failed: ${response.status} ${url}`);
  }
  return response.json();
}

async function pagesFromApi(api, titles, onPage) {
  for (let index = 0; index < titles.length; index += 50) {
    const batch = titles.slice(index, index + 50);
    const payload = await fetchJson(api, {
      action: "query",
      prop: "revisions",
      rvprop: "ids|timestamp|content|contentmodel",
      rvslots: "main",
      redirects: "1",
      titles: batch.join("|"),
      format: "json",
      formatversion: "2",
    });
    for (const page of payload.query?.pages ?? []) {
      if (page.missing) continue;
      const revision = page.revisions?.[0];
      await onPage({
        title: page.title,
        namespace: page.ns,
        pageId: page.pageid,
        revisionId: revision?.revid ?? null,
        timestamp: revision?.timestamp ?? null,
        contentModel:
          revision?.slots?.main?.contentmodel ??
          page.contentmodel ??
          "wikitext",
        source: revision?.slots?.main?.content ?? "",
        sourceKind: "api",
      });
    }
  }
}

async function allPageTitles(api, namespaces) {
  const titles = [];
  for (const namespace of [...namespaces].sort((a, b) => a - b)) {
    let continuation;
    do {
      const payload = await fetchJson(api, {
        action: "query",
        list: "allpages",
        aplimit: "max",
        apnamespace: String(namespace),
        ...(continuation ? { apcontinue: continuation } : {}),
        format: "json",
        formatversion: "2",
      });
      titles.push(...(payload.query?.allpages ?? []).map((page) => page.title));
      continuation = payload.continue?.apcontinue;
    } while (continuation);
  }
  return titles;
}

async function ensureEmptyDirectory(directory) {
  await mkdir(directory, { recursive: true });
  const existing = await readdir(directory);
  if (existing.length > 0) {
    throw new Error(`Output directory must be empty: ${directory}`);
  }
}

async function copyParserConfigMetadata(parserConfig, metadataDirectory) {
  const sourcePath = resolve(parserConfig);
  try {
    const source = await readFile(sourcePath, "utf8");
    JSON.parse(source);
    const file = "metadata/parser-config.json";
    await writeFile(
      resolve(metadataDirectory, "parser-config.json"),
      source,
      "utf8",
    );
    return { value: { file, original: parserConfig }, metadataFile: file };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { value: parserConfig, metadataFile: undefined };
    }
    throw new Error(
      `Could not copy parser config ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const output = resolve(options.output);
  await ensureEmptyDirectory(output);
  const maximum = options.maxPages ?? tierMaximums[options.tier];
  const selected = [];
  const excluded = { namespace: 0, title: 0, content: 0, contentModel: 0 };
  let discovered = 0;
  const consider = async (page) => {
    discovered++;
    if (options.namespaces && !options.namespaces.has(page.namespace)) {
      excluded.namespace++;
      return;
    }
    if (options.excludeTitles.some((pattern) => pattern.test(page.title))) {
      excluded.title++;
      return;
    }
    if (options.excludeContents.some((pattern) => pattern.test(page.source))) {
      excluded.content++;
      return;
    }
    if (page.contentModel.toLowerCase() !== "wikitext") {
      excluded.contentModel++;
      return;
    }
    if (!includePage(page, options)) return;
    selected.push({ ...page, rank: rank(options.seed, page.title) });
    selected.sort(
      (a, b) => a.rank.localeCompare(b.rank) || a.title.localeCompare(b.title),
    );
    if (selected.length > maximum) selected.pop();
  };

  let siteinfo;
  let localizationAliases;
  if (options.xml) {
    await pagesFromXml(options.xml, consider);
    if (options.siteinfo) {
      siteinfo = JSON.parse(await readFile(resolve(options.siteinfo), "utf8"));
      localizationAliases = normalizedAliases(
        siteinfo,
        `Siteinfo file ${resolve(options.siteinfo)}`,
      );
    }
  } else {
    const titles = options.allPages
      ? await allPageTitles(options.api, options.namespaces)
      : (await readFile(resolve(options.titles), "utf8"))
          .split(/\r?\n/u)
          .map((title) => title.trim())
          .filter((title) => title && !title.startsWith("#"));
    await pagesFromApi(options.api, titles, consider);
    siteinfo = await fetchJson(options.api, {
      action: "query",
      meta: "siteinfo",
      siprop:
        "general|namespaces|namespacealiases|magicwords|doubleunderscores",
      format: "json",
      formatversion: "2",
    });
    localizationAliases = normalizeSiteInfoPayload(
      siteinfo,
      `MediaWiki siteinfo response from ${options.api}`,
    );
  }

  const sourcesDirectory = resolve(output, "sources");
  const metadataDirectory = resolve(output, "metadata");
  await mkdir(sourcesDirectory, { recursive: true });
  await mkdir(metadataDirectory, { recursive: true });
  const metadata = [];
  const namespaceDistribution = {};
  let totalBytes = 0;
  for (const [index, page] of selected.entries()) {
    const sourceFile = `${String(index + 1).padStart(6, "0")}.wiki`;
    await writeFile(resolve(sourcesDirectory, sourceFile), page.source, "utf8");
    const bytes = Buffer.byteLength(page.source);
    totalBytes += bytes;
    namespaceDistribution[page.namespace] =
      (namespaceDistribution[page.namespace] ?? 0) + 1;
    metadata.push({
      title: page.title,
      namespace: page.namespace,
      pageId: page.pageId,
      revisionId: page.revisionId,
      timestamp: page.timestamp,
      contentModel: page.contentModel,
      bytes,
      sha256: createHash("sha256").update(page.source).digest("hex"),
      sourceFile: `sources/${sourceFile}`,
      sourceKind: page.sourceKind,
    });
  }
  await writeFile(
    resolve(metadataDirectory, "pages.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  if (siteinfo) {
    await writeFile(
      resolve(metadataDirectory, "siteinfo.raw.json"),
      `${JSON.stringify(siteinfo, null, 2)}\n`,
    );
    await writeFile(
      resolve(metadataDirectory, "localization-aliases.json"),
      `${JSON.stringify(localizationAliases, null, 2)}\n`,
    );
  }
  const parserConfig = await copyParserConfigMetadata(
    options.parserConfig,
    metadataDirectory,
  );
  const manifest = {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    source: options.xml
      ? { kind: "xml", file: basename(options.xml) }
      : {
          kind: "api",
          endpoint: options.api,
          titleList: options.titles ? basename(options.titles) : null,
          allPages: options.allPages,
        },
    tier: options.tier,
    seed: options.seed,
    parserConfig: parserConfig.value,
    namespaces: options.namespaces
      ? [...options.namespaces].sort((a, b) => a - b)
      : null,
    maximumPages: Number.isFinite(maximum) ? maximum : null,
    pagesDiscovered: discovered,
    pagesSelected: selected.length,
    totalBytes,
    namespaceDistribution,
    excluded,
    readOnly: true,
    metadata: {
      pages: "metadata/pages.json",
      ...(siteinfo
        ? {
            siteinfoRaw: "metadata/siteinfo.raw.json",
            localizationAliases: "metadata/localization-aliases.json",
          }
        : {}),
      ...(parserConfig.metadataFile
        ? { parserConfig: parserConfig.metadataFile }
        : {}),
    },
  };
  await writeFile(
    resolve(output, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

await main();

import type { Config, ConfigData } from "wikiparser-node";
import bundledDefaultConfigData from "wikiparser-node/config/default.json" with {
  type: "json",
};

import {
  createParserRuntime,
  type ParserImplementation,
  type ParserRoot,
  UnsupportedParserConfigError,
} from "./parserRuntime.js";

type BrowserParserRoot = ParserRoot & {
  getAttribute(name: "config"): unknown;
};

interface BrowserParserAdapter {
  getConfig(config?: ConfigData): Config;
  parse(
    source: string,
    include?: boolean,
    maxStage?: never,
    config?: Config,
  ): unknown;
}

function isBrowserParserAdapter(value: unknown): value is BrowserParserAdapter {
  return (
    typeof value === "object" &&
    value !== null &&
    "parse" in value &&
    typeof value.parse === "function" &&
    "getConfig" in value &&
    typeof value.getConfig === "function"
  );
}

function validateBrowserParser(value: unknown): BrowserParserAdapter {
  if (!isBrowserParserAdapter(value)) {
    throw new Error(
      "The browser-compatible wikiparser-node runtime did not expose globalThis.Parser.parse.",
    );
  }
  return value;
}

function isBrowserParserRoot(value: unknown): value is BrowserParserRoot {
  return (
    typeof value === "object" &&
    value !== null &&
    "getAttribute" in value &&
    typeof value.getAttribute === "function" &&
    "querySelectorAll" in value &&
    typeof value.querySelectorAll === "function" &&
    typeof value.toString === "function"
  );
}

interface BrowserParserNode {
  readonly childNodes?: readonly BrowserParserNode[];
  readonly interwiki?: unknown;
  readonly type?: string;
  toString(): string;
}

function isBrowserParserNode(value: unknown): value is BrowserParserNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof value.toString === "function"
  );
}

function parserConfirmedInterwikiPrefix(
  node: BrowserParserNode,
  config: Config,
): string | undefined {
  const target = node.childNodes?.find((child) => child.type === "link-target");
  if (!target) return undefined;

  // The upstream browser bundle deliberately removes Title's Node-only
  // interwiki property. It still parses the link and its target structurally,
  // so classify only that parser-produced target against the active Config.
  const title = target.toString().trim();
  if (title.startsWith(":")) return undefined;
  const separator = title.indexOf(":");
  if (separator <= 0) return undefined;
  const prefix = title.slice(0, separator).trimEnd().toLocaleLowerCase();
  return config.interwiki.find(
    (candidate) =>
      candidate.replaceAll("_", " ").toLocaleLowerCase() === prefix,
  );
}

function annotateBrowserInterwiki(
  root: BrowserParserRoot,
  config: Config,
): BrowserParserRoot {
  for (const value of root.querySelectorAll("link")) {
    if (!isBrowserParserNode(value) || typeof value.interwiki === "string") {
      continue;
    }
    const interwiki = parserConfirmedInterwikiPrefix(value, config);
    if (!interwiki) continue;
    Object.defineProperty(value, "interwiki", {
      configurable: true,
      value: interwiki,
    });
  }
  return root;
}

function parseBrowserRoot(
  parser: BrowserParserAdapter,
  source: string,
  config: Config,
): BrowserParserRoot {
  const root = parser.parse(source, false, undefined, config);
  if (!isBrowserParserRoot(root)) {
    throw new Error(
      "The browser-compatible wikiparser-node runtime returned an invalid parser root.",
    );
  }
  return annotateBrowserInterwiki(root, config);
}

function isParserConfig(value: unknown): value is Config {
  return (
    typeof value === "object" &&
    value !== null &&
    "ext" in value &&
    Array.isArray(value.ext) &&
    "variable" in value &&
    Array.isArray(value.variable) &&
    "parserFunction" in value &&
    Array.isArray(value.parserFunction) &&
    "doubleUnderscore" in value &&
    Array.isArray(value.doubleUnderscore) &&
    "namespaces" in value &&
    typeof value.namespaces === "object"
  );
}

function cloneConfigData(config: ConfigData): ConfigData {
  return JSON.parse(JSON.stringify(config)) as ConfigData;
}

function createBundledDefaultConfig(parser: BrowserParserAdapter): Config {
  // The upstream UMD bundle exposes only its deliberately minimal default
  // configuration. Its non-enumerable public getConfig() applies the exact
  // upstream normalization used by the Node entry, without a filesystem
  // dependency or runtime fetch.
  return parser.getConfig(
    cloneConfigData(bundledDefaultConfigData as unknown as ConfigData),
  );
}

interface BrowserParserState {
  readonly parser: BrowserParserAdapter;
  readonly config: Readonly<Config>;
}

interface GlobalParserSnapshot {
  readonly descriptor: PropertyDescriptor | undefined;
  readonly value: unknown;
}

function captureGlobalParser(): GlobalParserSnapshot {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Parser");
  return {
    descriptor,
    value: descriptor ? Reflect.get(globalThis, "Parser") : undefined,
  };
}

function restoreGlobalParser(snapshot: GlobalParserSnapshot): void {
  if (snapshot.descriptor) {
    Object.defineProperty(globalThis, "Parser", snapshot.descriptor);
    if (
      !("value" in snapshot.descriptor) &&
      snapshot.descriptor.set &&
      !Reflect.set(globalThis, "Parser", snapshot.value)
    ) {
      throw new Error(
        "The pre-existing globalThis.Parser accessor could not be restored after initialization.",
      );
    }
    return;
  }
  if (!Reflect.deleteProperty(globalThis, "Parser")) {
    throw new Error(
      "The browser-compatible wikiparser-node runtime global could not be removed after initialization.",
    );
  }
}

async function initializeBrowserParser(): Promise<BrowserParserState> {
  const previousGlobalParser = captureGlobalParser();

  try {
    // The upstream browser bundle is a UMD side-effect module whose only parser
    // API is installed on globalThis. A dynamic import lets us record and later
    // restore that property before any dependency evaluation can overwrite it.
    const browserRuntimeModule = await import(
      "wikiparser-node/bundle/bundle-lsp.min.js",
    );
    if (
      typeof browserRuntimeModule !== "object" ||
      browserRuntimeModule === null
    ) {
      throw new Error(
        "The browser-compatible wikiparser-node bundle did not evaluate.",
      );
    }

    const parser = validateBrowserParser(Reflect.get(globalThis, "Parser"));
    const config = createBundledDefaultConfig(parser);
    if (!isParserConfig(config)) {
      throw new Error(
        "The browser-compatible wikiparser-node runtime returned an invalid parser configuration.",
      );
    }
    return Object.freeze({ parser, config });
  } finally {
    restoreGlobalParser(previousGlobalParser);
  }
}

const browserParserState = await initializeBrowserParser();

function resolveBrowserConfig(name: string): Config {
  if (name === undefined || name === "mediawiki" || name === "default") {
    return browserParserState.config as Config;
  }

  throw new UnsupportedParserConfigError(
    name,
    `Parser configuration "${name}" is unavailable in the browser build; only "mediawiki" and "default" are supported. Named and filesystem parser configurations require the Node.js entry point.`,
  );
}

const browserParserImplementation: ParserImplementation = {
  parse: (source, config) =>
    parseBrowserRoot(browserParserState.parser, source, config),
};

export const browserParserRuntime = createParserRuntime(
  browserParserImplementation,
  resolveBrowserConfig,
);

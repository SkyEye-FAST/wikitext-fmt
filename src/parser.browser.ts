import browserRuntimeSideEffect from "wikiparser-node/bundle/bundle-lsp.min.js";

import type { Config } from "wikiparser-node";

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
    typeof value.parse === "function"
  );
}

function browserParserAdapter(): BrowserParserAdapter {
  // wikiparser-node marks this UMD bundle as side-effect-free even though its
  // only parser API is installed on globalThis. Reading the imported value
  // keeps bundlers from dropping evaluation; the value itself is not an API.
  if (browserRuntimeSideEffect === undefined) {
    throw new Error(
      "The browser-compatible wikiparser-node bundle did not evaluate.",
    );
  }
  const candidate: unknown = Reflect.get(globalThis, "Parser");
  if (!isBrowserParserAdapter(candidate)) {
    throw new Error(
      "The browser-compatible wikiparser-node runtime did not expose globalThis.Parser.parse.",
    );
  }
  return candidate;
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

function parseBrowserRoot(source: string, config?: Config): BrowserParserRoot {
  const root = browserParserAdapter().parse(source, false, undefined, config);
  if (!isBrowserParserRoot(root)) {
    throw new Error(
      "The browser-compatible wikiparser-node runtime returned an invalid parser root.",
    );
  }
  return root;
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

function resolveBrowserConfig(name: string): Config {
  if (name === undefined || name === "mediawiki" || name === "default") {
    // The upstream browser bundle is a UMD side-effect module. It exposes its
    // fully resolved built-in configuration only through parsed root tokens.
    const config = parseBrowserRoot("").getAttribute("config");
    if (!isParserConfig(config)) {
      throw new Error(
        "The browser-compatible wikiparser-node runtime returned an invalid parser configuration.",
      );
    }
    return config;
  }

  throw new UnsupportedParserConfigError(
    name,
    `Parser configuration "${name}" is unavailable in the browser build; only "mediawiki" and "default" are supported. Named and filesystem parser configurations require the Node.js entry point.`,
  );
}

const browserParserImplementation: ParserImplementation = {
  parse: (source, config) => parseBrowserRoot(source, config),
};

export const browserParserRuntime = createParserRuntime(
  browserParserImplementation,
  resolveBrowserConfig,
);

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

function parseBrowserRoot(
  parser: BrowserParserAdapter,
  source: string,
  config?: Config,
): BrowserParserRoot {
  const root = parser.parse(source, false, undefined, config);
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
    const config = parseBrowserRoot(parser, "").getAttribute("config");
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

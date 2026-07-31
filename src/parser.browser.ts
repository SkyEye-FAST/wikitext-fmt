import browserRuntimeModule from "wikiparser-node/bundle/bundle-lsp.min.js";

import type Parser from "wikiparser-node";
import type { ConfigData } from "wikiparser-node";
import bundledDefaultConfig from "wikiparser-node/config/default.json" with { type: "json" };

import {
  createParserRuntime,
  UnsupportedParserConfigError,
} from "./parserRuntime.js";

const importedBrowserParser = browserRuntimeModule as Partial<typeof Parser>;
const globalBrowserParser = (
  globalThis as typeof globalThis & { Parser?: typeof Parser }
).Parser;
const browserParser =
  typeof importedBrowserParser.parse === "function" &&
  typeof importedBrowserParser.getConfig === "function"
    ? (importedBrowserParser as typeof Parser)
    : globalBrowserParser;

if (
  !browserParser ||
  typeof browserParser.parse !== "function" ||
  typeof browserParser.getConfig !== "function"
) {
  throw new Error(
    "The browser-compatible wikiparser-node runtime did not load.",
  );
}

function loadBrowserConfig(name: string): ConfigData {
  if (name === undefined || name === "mediawiki" || name === "default") {
    return bundledDefaultConfig as unknown as ConfigData;
  }

  throw new UnsupportedParserConfigError(
    name,
    `Parser configuration "${name}" is unavailable in the browser build; only "mediawiki" and "default" are supported. Named and filesystem parser configurations require the Node.js entry point.`,
  );
}

export const browserParserRuntime = createParserRuntime(
  browserParser,
  loadBrowserConfig,
);

import type Parser from "wikiparser-node";
import type { Config } from "wikiparser-node";

import { createParserContext } from "./parserContext.js";
import type { ParsedDocumentContext } from "./parserContext.js";

export type ParserRoot = ReturnType<typeof Parser.parse>;

export interface ParserImplementation {
  parse(source: string, config: Config): ParserRoot;
}

export interface ParserSession {
  readonly config: Config;
  parse(source: string): ParserRoot;
  createContext(source: string): ParsedDocumentContext;
  isRoundTripSafe(source: string): boolean;
}

export interface ParserSessionOptions {
  interwikiPrefixes?: readonly string[];
}

export interface ParserRuntime {
  createSession(name: string, options?: ParserSessionOptions): ParserSession;
}

export class UnsupportedParserConfigError extends Error {
  readonly parserConfig: string;

  constructor(parserConfig: string, message: string) {
    super(message);
    this.name = "UnsupportedParserConfigError";
    this.parserConfig = parserConfig;
  }
}

export function createParserRuntime(
  parser: ParserImplementation,
  resolveConfig: (name: string) => Config,
): ParserRuntime {
  return {
    createSession: (name, options) =>
      createParserSession(
        parser,
        parserConfigWithInterwikiPrefixes(
          resolveConfig(name),
          options?.interwikiPrefixes,
        ),
      ),
  };
}

function normalizedParserPrefix(prefix: string): string {
  return prefix.trim().replaceAll("_", " ").toLocaleLowerCase();
}

export function parserConfigWithInterwikiPrefixes(
  config: Config,
  prefixes?: readonly string[],
): Config {
  if (prefixes === undefined) return config;
  const localNamespaces = new Set(
    Object.keys(config.nsid).map(normalizedParserPrefix),
  );
  const seen = new Set<string>();
  const interwiki: string[] = [];
  for (const prefix of [...config.interwiki, ...prefixes]) {
    const normalized = normalizedParserPrefix(prefix);
    if (
      !normalized ||
      localNamespaces.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }
    seen.add(normalized);
    interwiki.push(prefix.trim());
  }
  return { ...config, interwiki };
}

export function createParserSession(
  parser: ParserImplementation,
  config: Config,
): ParserSession {
  const parse = (source: string): ParserRoot => parser.parse(source, config);
  let session: ParserSession;
  session = {
    config,
    parse,
    createContext: (source) => createParserContext(source, session),
    isRoundTripSafe: (source) => parse(source).toString() === source,
  };
  return Object.freeze(session);
}

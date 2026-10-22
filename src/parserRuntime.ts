import type Parser from "wikiparser-node";
import type { Config } from "wikiparser-node";

import { createParserContext } from "./parserContext.js";
import type { ParsedDocumentContext } from "./parserContext.js";

export type ParserRoot = ReturnType<typeof Parser.parse>;

export interface ParserImplementation {
  parse(source: string, config: Config): ParserRoot;
  /**
   * Runs read-only work with the parser's position and string caches enabled.
   * The formatter never mutates parser trees, so enabling wikiparser-node's
   * view-only mode turns repeated index lookups from quadratic into cached
   * reads. Implementations must restore the previous mode afterwards.
   */
  readOnly?<T>(run: () => T): T;
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
  readOnly?<T>(run: () => T): T;
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
    readOnly: parser.readOnly?.bind(parser),
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
  // Formatting stages and equivalence checks repeatedly ask for the same
  // snapshot (the stage input, the verified candidate, the second safe pass).
  // Parser trees are never mutated by the formatter, so a session can hand
  // out the same context for identical text. The cache is bounded by entry
  // count and source bytes so very large pages keep only recent snapshots.
  const contexts = new Map<string, ParsedDocumentContext>();
  let cachedBytes = 0;
  const remember = (context: ParsedDocumentContext): void => {
    contexts.set(context.source, context);
    cachedBytes += context.source.length;
    for (const [source] of contexts) {
      if (
        contexts.size <= 1 ||
        (contexts.size <= CONTEXT_CACHE_ENTRIES &&
          cachedBytes <= CONTEXT_CACHE_BYTES)
      ) {
        break;
      }
      contexts.delete(source);
      cachedBytes -= source.length;
    }
  };
  const cachedContext = (
    source: string,
  ): ParsedDocumentContext | undefined => {
    const context = contexts.get(source);
    if (context) {
      contexts.delete(source);
      contexts.set(source, context);
    }
    return context;
  };
  const parse = (source: string): ParserRoot =>
    cachedContext(source)?.root ?? parser.parse(source, config);
  let session: ParserSession;
  session = {
    config,
    parse,
    createContext: (source) => {
      const cached = cachedContext(source);
      if (cached) return cached;
      const context = createParserContext(source, session);
      remember(context);
      return context;
    },
    isRoundTripSafe: (source) =>
      session.createContext(source).root.toString() === source,
  };
  return Object.freeze(session);
}

const CONTEXT_CACHE_ENTRIES = 24;
const CONTEXT_CACHE_BYTES = 4 * 1024 * 1024;

export function runReadOnly<T>(
  runtime: Pick<ParserRuntime, "readOnly">,
  run: () => T,
): T {
  return runtime.readOnly ? runtime.readOnly(run) : run();
}

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

export interface ParserRuntime {
  createSession(name: string): ParserSession;
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
    createSession: (name) => createParserSession(parser, resolveConfig(name)),
  };
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

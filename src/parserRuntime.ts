import type Parser from "wikiparser-node";
import type { Config, ConfigData } from "wikiparser-node";

type ParserImplementation = Pick<typeof Parser, "getConfig" | "parse">;

export type ParserRoot = ReturnType<ParserImplementation["parse"]>;

export interface ParserRuntime {
  getParserConfig(name: string): Config;
  parseWikitext(source: string, config: Config): ParserRoot;
  isRoundTripSafe(source: string, config: Config): boolean;
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
  loadConfigData: (name: string) => ConfigData,
): ParserRuntime {
  const parseWikitext = (source: string, config: Config): ParserRoot =>
    parser.parse(source, false, undefined, config);

  return {
    getParserConfig: (name) => parser.getConfig(loadConfigData(name)),
    parseWikitext,
    isRoundTripSafe: (source, config) =>
      parseWikitext(source, config).toString() === source,
  };
}

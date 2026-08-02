export {
  createNodeParserRuntime,
  createNodeParserSession,
  getParserConfig,
  isRoundTripSafe,
  loadParserConfigDataForTesting,
  nodeParserRuntime,
  parseWikitext,
} from "./parser.node.js";
export type {
  ParserRoot,
  ParserRuntime,
  ParserSession,
  ParserSessionOptions,
} from "./parserRuntime.js";

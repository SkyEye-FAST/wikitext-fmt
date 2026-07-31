import type { Config } from "wikiparser-node";

import { nodeParserRuntime } from "./parser.node.js";
import { createParserContext as createParserContextWithRuntime } from "./parserContext.js";

export * from "./parserContext.js";

export function createParserContext(source: string, config: Config) {
  return createParserContextWithRuntime(source, config, nodeParserRuntime);
}

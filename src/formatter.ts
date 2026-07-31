import { createFormatter } from "./formatterEngine.js";
import { nodeParserRuntime } from "./parser.node.js";

export type {
  FormatDetailedResult,
  FormatFailure,
  FormatFailureCode,
  FormatResult,
} from "./formatterEngine.js";

const nodeFormatter = createFormatter(nodeParserRuntime);

export const {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextResult,
  formatWikitextSafe,
  formatWikitextSafeDetailed,
} = nodeFormatter;

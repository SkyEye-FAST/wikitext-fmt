import { createFormatter } from "./formatterCore.js";
import { nodeParserRuntime } from "./parser.node.js";

export type {
  FormatDetailedResult,
  FormatFailure,
  FormatFailureCode,
  FormatResult,
} from "./formatterCore.js";

const nodeFormatter = createFormatter(nodeParserRuntime);

export const {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextResult,
  formatWikitextSafe,
  formatWikitextSafeDetailed,
} = nodeFormatter;

import { createFormatter } from "./formatterEngine.js";
import { browserParserRuntime } from "./parser.browser.js";

export * from "./public.js";

const browserFormatter = createFormatter(browserParserRuntime);

export const {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextResult,
  formatWikitextSafe,
  formatWikitextSafeDetailed,
} = browserFormatter;

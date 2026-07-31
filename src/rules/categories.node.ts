import type { Config } from "wikiparser-node";

import type { ResolvedFormatOptions } from "../options.js";
import { nodeParserRuntime } from "../parser.node.js";
import type { ParsedDocumentContext } from "../parserContext.js";
import {
  formatPageFooter as formatPageFooterWithRuntime,
  type PageFooterResult,
} from "./categories.js";

export {
  type FooterDiagnostics,
  isStandaloneBehaviorSwitchLine,
  type PageFooterResult,
} from "./categories.js";

export function formatPageFooter(
  source: string,
  config: Config,
  options: Pick<
    ResolvedFormatOptions,
    | "formatCategories"
    | "formatInterlanguageLinks"
    | "interlanguagePlacement"
    | "interlanguagePrefixes"
    | "formatBehaviorSwitches"
    | "behaviorSwitchPlacement"
    | "localizationSource"
    | "localizedSyntaxStyle"
    | "localizationAliases"
  >,
  context?: ParsedDocumentContext,
): PageFooterResult {
  return formatPageFooterWithRuntime(
    source,
    config,
    options,
    context,
    nodeParserRuntime,
  );
}

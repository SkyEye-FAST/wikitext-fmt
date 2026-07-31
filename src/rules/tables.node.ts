import type { Config } from "wikiparser-node";

import type { ResolvedFormatOptions } from "../options.js";
import { nodeParserRuntime } from "../parser.node.js";
import type { ParsedDocumentContext } from "../parserContext.js";
import {
  formatTablesWithDiagnostics as formatTablesWithDiagnosticsWithRuntime,
  type TableFormatWithDiagnosticsResult,
} from "./tables.js";

export {
  collectParserTableCandidates,
  type ParserTableCandidateStats,
  potentialParserTableOpenerPositions,
  type TableDiagnostic,
  type TableFormatDiagnostics,
} from "./tables.js";

export function formatTablesWithDiagnostics(
  source: string,
  config: Config,
  options: ResolvedFormatOptions,
  context?: ParsedDocumentContext,
): TableFormatWithDiagnosticsResult {
  return formatTablesWithDiagnosticsWithRuntime(
    source,
    config,
    options,
    context,
    nodeParserRuntime,
  );
}

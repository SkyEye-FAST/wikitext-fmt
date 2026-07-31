import type { Config } from "wikiparser-node";

import { nodeParserRuntime } from "../parser.node.js";
import type { ParsedDocumentContext } from "../parserContext.js";
import {
  formatLists as formatListsWithRuntime,
  formatListsWithDiagnostics as formatListsWithDiagnosticsWithRuntime,
  type ListFormatOptions,
  type ListFormatResult,
} from "./lists.js";

export type {
  ListDiagnostics,
  ListFormatOptions,
  ListFormatResult,
  ListSkipReason,
} from "./lists.js";

export function formatListsWithDiagnostics(
  source: string,
  config: Config,
  context?: ParsedDocumentContext,
  options: ListFormatOptions = {},
): ListFormatResult {
  return formatListsWithDiagnosticsWithRuntime(
    source,
    config,
    context,
    options,
    nodeParserRuntime,
  );
}

export function formatLists(
  source: string,
  config: Config,
  context?: ParsedDocumentContext,
  options?: ListFormatOptions,
): string {
  return formatListsWithRuntime(
    source,
    config,
    context,
    options,
    nodeParserRuntime,
  );
}

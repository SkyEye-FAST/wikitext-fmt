import type { Config } from "wikiparser-node";

import { nodeParserRuntime } from "../parser.node.js";
import type { ParsedDocumentContext } from "../parserContext.js";
import {
  formatTemplates as formatTemplatesWithRuntime,
  formatTemplatesWithDiagnostics as formatTemplatesWithDiagnosticsWithRuntime,
  type TemplateFormatOptions,
  type TemplateFormatResult,
} from "./templates.js";

export type {
  TemplateDiagnostics,
  TemplateFormatOptions,
  TemplateFormatResult,
} from "./templates.js";

export function formatTemplatesWithDiagnostics(
  source: string,
  config: Config,
  options: TemplateFormatOptions,
  context?: ParsedDocumentContext,
): TemplateFormatResult {
  return formatTemplatesWithDiagnosticsWithRuntime(
    source,
    config,
    options,
    context,
    nodeParserRuntime,
  );
}

export function formatTemplates(
  source: string,
  config: Config,
  lineWidth: number,
  context?: ParsedDocumentContext,
): string {
  return formatTemplatesWithRuntime(
    source,
    config,
    lineWidth,
    context,
    nodeParserRuntime,
  );
}

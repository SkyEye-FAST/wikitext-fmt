import { getParserConfig } from "../parser.js";
import {
  formatTemplatesWithDiagnostics,
  type TemplateDiagnostics,
} from "./templates.js";

/** @deprecated Use TemplateDiagnostics from the unified template formatter. */
export type TemplateParameterDiagnostics = TemplateDiagnostics;

export interface TemplateParameterResult {
  formatted: string;
  diagnostics: TemplateParameterDiagnostics;
}

/**
 * Compatibility wrapper for the pre-1.0 experimental API. All template
 * formatting is implemented by the parser-assisted engine in templates.ts.
 */
export function formatTemplateParameters(
  source: string,
): TemplateParameterResult {
  return formatTemplatesWithDiagnostics(source, getParserConfig("mediawiki"), {
    lineWidth: 120,
    layout: "preserve",
    parameterSpacing: true,
  });
}

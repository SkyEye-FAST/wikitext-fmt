export type ParserFunctionFormattingClass =
  | "opaque-preserve"
  | "safe-named-argument-normalization"
  | "safe-layout-formatting"
  | "unsupported-ambiguous";

export interface ParserFunctionPolicy {
  classification: ParserFunctionFormattingClass;
  reason: string;
}

const opaqueParserFunctions = new Set([
  "#expr",
  "#if",
  "#ifeq",
  "#iferror",
  "#ifexist",
  "#ifexpr",
  "#invoke",
  "#len",
  "#pos",
  "#rpos",
  "#sub",
  "#switch",
  "#tag",
  "#time",
  "#timel",
]);

export function classifyParserFunction(name: string): ParserFunctionPolicy {
  const normalized = name.trim().toLocaleLowerCase("en-US");
  if (opaqueParserFunctions.has(normalized)) {
    return {
      classification: "opaque-preserve",
      reason:
        "argument whitespace can participate in MediaWiki parser-function semantics",
    };
  }
  if (normalized.startsWith("#")) {
    return {
      classification: "unsupported-ambiguous",
      reason:
        "no function-specific whitespace proof is registered for this parser function",
    };
  }
  return {
    classification: "opaque-preserve",
    reason: "magic words and colon forms remain byte-preserving in production",
  };
}

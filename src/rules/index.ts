import type { FormatLevel } from "../options.js";

export type RuleName = "headings" | "blankLines" | "templates" | "categories" | "htmlVoidTags";

export const ruleLevels = {
  headings: "safe",
  blankLines: "safe",
  templates: "normal",
  categories: "normal",
  htmlVoidTags: "safe",
} as const satisfies Record<RuleName, FormatLevel>;

const levelOrder: Record<FormatLevel, number> = {
  safe: 0,
  normal: 1,
  experimental: 2,
};

export function isRuleEnabled(rule: RuleName, level: FormatLevel): boolean {
  return levelOrder[ruleLevels[rule]] <= levelOrder[level];
}

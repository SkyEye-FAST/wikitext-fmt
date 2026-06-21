import type { FormatLevel } from "../options.js";

export type RuleName =
  | "headings"
  | "blankLines"
  | "templates"
  | "categories"
  | "lists"
  | "htmlVoidTags"
  | "tables";

export const ruleLevels = {
  headings: "safe",
  blankLines: "safe",
  templates: "normal",
  categories: "normal",
  lists: "normal",
  htmlVoidTags: "safe",
  tables: "experimental",
} as const satisfies Record<RuleName, FormatLevel>;

const levelOrder: Record<FormatLevel, number> = {
  safe: 0,
  normal: 1,
  experimental: 2,
};

export function isRuleEnabled(rule: RuleName, level: FormatLevel): boolean {
  return levelOrder[ruleLevels[rule]] <= levelOrder[level];
}

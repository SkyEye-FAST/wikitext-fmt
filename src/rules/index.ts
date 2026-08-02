import type { FormatLevel } from "../options.js";

export type RuleName =
  | "headings"
  | "blankLines"
  | "templates"
  | "categories"
  | "lists"
  | "fileLinks"
  | "wikilinks"
  | "externalLinks"
  | "references"
  | "interlanguageLinks"
  | "sectionSpacing"
  | "redirects"
  | "behaviorSwitches"
  | "htmlVoidTags"
  | "tables";

export const ruleLevels = {
  headings: "safe",
  blankLines: "safe",
  templates: "normal",
  categories: "normal",
  lists: "normal",
  fileLinks: "normal",
  wikilinks: "normal",
  externalLinks: "normal",
  references: "normal",
  interlanguageLinks: "normal",
  sectionSpacing: "normal",
  redirects: "normal",
  behaviorSwitches: "normal",
  htmlVoidTags: "safe",
  tables: "normal",
} as const satisfies Record<RuleName, FormatLevel>;

const levelOrder: Record<FormatLevel, number> = {
  safe: 0,
  normal: 1,
  experimental: 2,
};

export function isRuleEnabled(rule: RuleName, level: FormatLevel): boolean {
  return levelOrder[ruleLevels[rule]] <= levelOrder[level];
}

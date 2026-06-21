import type { FormatOptions } from "../options.js";

export type OptionValueType =
  | "boolean"
  | "enum"
  | "number"
  | "string"
  | "stringArray"
  | "object";

export interface OptionSchemaEntry<
  K extends keyof FormatOptions = keyof FormatOptions,
> {
  name: K;
  type: OptionValueType;
  defaultValue?: FormatOptions[K];
  enumValues?: readonly string[];
  positiveFlag?: string;
  negativeFlag?: string;
  ruleName?: string;
  ruleLevel?: "safe" | "normal" | "experimental";
}

export const optionSchema: readonly OptionSchemaEntry[] = [
  { name: "parserConfig", type: "string", defaultValue: "mediawiki" },
  { name: "lineWidth", type: "number", defaultValue: 120 },
  {
    name: "formatHeadings",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-format-headings",
    ruleName: "headings",
    ruleLevel: "safe",
  },
  {
    name: "formatTemplates",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-format-templates",
    ruleName: "templates",
    ruleLevel: "normal",
  },
  {
    name: "formatTemplateParameters",
    type: "boolean",
    defaultValue: false,
    positiveFlag: "--format-template-parameters",
    negativeFlag: "--no-format-template-parameters",
    ruleName: "templateParameters",
    ruleLevel: "experimental",
  },
  {
    name: "formatCategories",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-format-categories",
    ruleName: "categories",
    ruleLevel: "normal",
  },
  {
    name: "formatLists",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-format-lists",
    ruleName: "lists",
    ruleLevel: "normal",
  },
  {
    name: "formatFileLinks",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-format-file-links",
    ruleName: "fileLinks",
    ruleLevel: "normal",
  },
  {
    name: "formatInterlanguageLinks",
    type: "boolean",
    defaultValue: false,
    positiveFlag: "--format-interlanguage-links",
    negativeFlag: "--no-format-interlanguage-links",
    ruleName: "interlanguageLinks",
    ruleLevel: "experimental",
  },
  {
    name: "interlanguagePlacement",
    type: "enum",
    defaultValue: "preserve",
    enumValues: ["preserve", "footer"],
  },
  {
    name: "interlanguagePrefixes",
    type: "stringArray",
  },
  {
    name: "formatSectionSpacing",
    type: "boolean",
    defaultValue: false,
    positiveFlag: "--format-section-spacing",
    negativeFlag: "--no-format-section-spacing",
    ruleName: "sectionSpacing",
    ruleLevel: "experimental",
  },
  {
    name: "formatBehaviorSwitches",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-format-behavior-switches",
    ruleName: "behaviorSwitches",
    ruleLevel: "normal",
  },
  {
    name: "formatRedirects",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-format-redirects",
    ruleName: "redirects",
    ruleLevel: "normal",
  },
  {
    name: "behaviorSwitchPlacement",
    type: "enum",
    defaultValue: "preserve",
    enumValues: ["preserve", "footer"],
  },
  {
    name: "localizationSource",
    type: "enum",
    defaultValue: "builtin",
    enumValues: ["builtin", "siteinfo", "custom"],
  },
  {
    name: "localizedSyntaxStyle",
    type: "enum",
    defaultValue: "preserve",
    enumValues: ["preserve", "canonical-english"],
  },
  { name: "localizationAliases", type: "object", defaultValue: {} },
  {
    name: "formatTables",
    type: "boolean",
    defaultValue: false,
    positiveFlag: "--format-tables",
    negativeFlag: "--no-format-tables",
    ruleName: "tables",
    ruleLevel: "experimental",
  },
  {
    name: "tableCellSeparatorStyle",
    type: "enum",
    defaultValue: "auto",
    enumValues: ["auto", "split", "preserve"],
  },
  {
    name: "normalizeBlankLines",
    type: "boolean",
    defaultValue: true,
    negativeFlag: "--no-normalize-blank-lines",
    ruleName: "blankLines",
    ruleLevel: "safe",
  },
  {
    name: "level",
    type: "enum",
    defaultValue: "normal",
    enumValues: ["safe", "normal", "experimental"],
  },
  {
    name: "htmlVoidTagStyle",
    type: "enum",
    defaultValue: "html5",
    enumValues: ["html5", "xhtml", "preserve"],
    ruleName: "htmlVoidTags",
    ruleLevel: "safe",
  },
] as const;

export const formatOptionNames = optionSchema.map((entry) => entry.name);

export const booleanOptionNames = optionSchema
  .filter((entry) => entry.type === "boolean")
  .map((entry) => entry.name);

export const enumOptions = optionSchema.filter(
  (entry): entry is OptionSchemaEntry & { enumValues: readonly string[] } =>
    entry.type === "enum" && Array.isArray(entry.enumValues),
);

export const booleanCliFlags = new Map(
  optionSchema.flatMap((entry) => {
    if (entry.type !== "boolean") return [];
    const pairs: Array<
      [string, { name: keyof FormatOptions; value: boolean }]
    > = [];
    if (entry.positiveFlag)
      pairs.push([entry.positiveFlag, { name: entry.name, value: true }]);
    if (entry.negativeFlag)
      pairs.push([entry.negativeFlag, { name: entry.name, value: false }]);
    return pairs;
  }),
);

import { defaultOptions, type FormatOptions } from "wikitext-fmt";

export interface VscodeFormatOptionMetadata {
  name: keyof FormatOptions;
  defaultValue: FormatOptions[keyof FormatOptions];
}

export const vscodeFormatOptionMetadata = [
  { name: "profile", defaultValue: defaultOptions.profile },
  { name: "lineWidth", defaultValue: defaultOptions.lineWidth },
  { name: "formatHeadings", defaultValue: defaultOptions.formatHeadings },
  { name: "formatTemplates", defaultValue: defaultOptions.formatTemplates },
  {
    name: "inlineTemplateSpacing",
    defaultValue: defaultOptions.inlineTemplateSpacing,
  },
  {
    name: "templateParameterLayout",
    defaultValue: defaultOptions.templateParameterLayout,
  },
  {
    name: "formatTemplateParameters",
    defaultValue: defaultOptions.formatTemplateParameters,
  },
  { name: "formatCategories", defaultValue: defaultOptions.formatCategories },
  { name: "formatLists", defaultValue: defaultOptions.formatLists },
  { name: "formatFileLinks", defaultValue: defaultOptions.formatFileLinks },
  { name: "formatWikilinks", defaultValue: defaultOptions.formatWikilinks },
  {
    name: "formatExternalLinks",
    defaultValue: defaultOptions.formatExternalLinks,
  },
  {
    name: "formatReferences",
    defaultValue: defaultOptions.formatReferences,
  },
  {
    name: "formatInterlanguageLinks",
    defaultValue: defaultOptions.formatInterlanguageLinks,
  },
  {
    name: "interlanguagePlacement",
    defaultValue: defaultOptions.interlanguagePlacement,
  },
  {
    name: "interlanguagePrefixes",
    defaultValue: defaultOptions.interlanguagePrefixes,
  },
  {
    name: "formatSectionSpacing",
    defaultValue: defaultOptions.formatSectionSpacing,
  },
  {
    name: "formatBehaviorSwitches",
    defaultValue: defaultOptions.formatBehaviorSwitches,
  },
  { name: "formatRedirects", defaultValue: defaultOptions.formatRedirects },
  {
    name: "behaviorSwitchPlacement",
    defaultValue: defaultOptions.behaviorSwitchPlacement,
  },
  {
    name: "localizedSyntaxStyle",
    defaultValue: defaultOptions.localizedSyntaxStyle,
  },
  { name: "formatTables", defaultValue: defaultOptions.formatTables },
  {
    name: "tableCellSeparatorStyle",
    defaultValue: defaultOptions.tableCellSeparatorStyle,
  },
  {
    name: "normalizeBlankLines",
    defaultValue: defaultOptions.normalizeBlankLines,
  },
  { name: "level", defaultValue: defaultOptions.level },
  { name: "htmlVoidTagStyle", defaultValue: defaultOptions.htmlVoidTagStyle },
] as const satisfies readonly VscodeFormatOptionMetadata[];

export const configFileOnlyOptionNames = [
  "parserConfig",
  "localizationSource",
  "localizationAliases",
] as const satisfies readonly (keyof FormatOptions)[];


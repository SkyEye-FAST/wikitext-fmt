import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import { createNodeParserSession, getParserConfig } from "../src/parser.js";
import { formatReferences } from "../src/rules/references.js";

const options = {
  level: "normal" as const,
  formatReferences: true,
};
const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);

describe("reference formatting", () => {
  it("is disabled by default", () => {
    expect(formatWikitext("<references/>\n")).toBe("<references/>\n");
  });

  it("requires normal level and an explicit option outside production", () => {
    expect(formatWikitext("<references/>\n", { formatReferences: true })).toBe(
      "<references />\n",
    );
    expect(
      formatWikitext("<references/>\n", {
        level: "safe",
        formatReferences: true,
      }),
    ).toBe("<references/>\n");
  });

  it("is enabled by the production profile and can be disabled", () => {
    const input = "<references/>\n";
    expect(formatWikitext(input, { profile: "production" })).toBe(
      "<references />\n",
    );
    expect(
      formatWikitext(input, {
        profile: "production",
        formatReferences: false,
      }),
    ).toBe(input);
  });

  it.each([
    ["<references/>\n", "<references />\n"],
    ["<references   />\n", "<references />\n"],
    ['<references group="note"/>\n', '<references group="note" />\n'],
    ['<references group="note" />   \n', '<references group="note" />\n'],
    ['<ref name="foo"/>\n', '<ref name="foo" />\n'],
    ['<ref name="foo" />   \n', '<ref name="foo" />\n'],
  ])("formats safe standalone reference line %s", (input, expected) => {
    expect(formatWikitext(input, options)).toBe(expected);
  });

  it("uses parser-confirmed whole-line extension nodes when context is provided", () => {
    const source = '<references group="note"/>\n';
    expect(
      formatReferences(source, session.createContext(source)).formatted,
    ).toBe('<references group="note" />\n');
  });

  it.each([
    [`<ref name="O'Brien"/>\n`, `<ref name="O'Brien" />\n`, 0],
    [`<ref name='a"b'/>\n`, `<ref name='a"b' />\n`, 0],
    [
      `<ref name="a'b" group='c"d'/>\n`,
      `<ref name="a'b" group='c"d' />\n`,
      0,
    ],
    [
      `<references group="O'Brien"/>\n`,
      `<references group="O'Brien" />\n`,
      1,
    ],
  ])("preserves opposite quotes inside attribute values %s", (input, expected, groups) => {
    for (const context of [
      undefined,
      session.createContext(input),
      session.createContext("Plain text\n"),
    ]) {
      const result = formatReferences(input, context);
      expect(result.formatted).toBe(expected);
      expect(result.diagnostics).toEqual({
        referencesFormatted: 1,
        referenceGroupsFormatted: groups,
        referenceLinesSkippedUnsafe: 0,
      });
    }
    const result = formatWikitextSafeDetailed(input, options);
    expect(result.failure).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(expected);
    const canonical = formatWikitextSafeDetailed(expected, options);
    expect(canonical.failure).toBeUndefined();
    expect(canonical.formatted).toBe(expected);
    expect(canonical.referenceDiagnostics.referencesFormatted).toBe(0);
  });

  it.each([
    `<ref name="a'b" group='c/>\n`,
    `<ref name='a"b' group="c/>\n`,
    `<ref name="a'b/>\n`,
    `<ref name='a"b/>\n`,
  ])("skips unclosed quotes even when opposite quotes make counts even %s", (input) => {
    const result = formatReferences(input);
    expect(result.formatted).toBe(input);
    expect(result.diagnostics.referenceLinesSkippedUnsafe).toBe(1);
    expect(formatWikitextSafeDetailed(input, options).formatted).toBe(input);
  });

  it("preserves CRLF and option/level gates for quoted reference names", () => {
    const input = `<ref name="O'Brien"/>\r\n`;
    const result = formatWikitextSafeDetailed(input, { profile: "production" });
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe(`<ref name="O'Brien" />\r\n`);
    expect(formatWikitext(input, { ...options, level: "safe" })).toBe(input);
    expect(formatWikitext(input, {
      profile: "production",
      formatReferences: false,
    })).toBe(input);
  });

  it.each([
    `<nowiki>\n<ref name="O'Brien"/>\n</nowiki>\n`,
    `<!--\n<ref name="O'Brien"/>\n-->\n`,
    `<!-- wikitext-fmt-ignore -->\n<ref name="O'Brien"/>\n`,
    `<ref name="O'Brien">content</ref>\n`,
  ])("retains protected and unsupported reference layouts %s", (input) => {
    const result = formatWikitextSafeDetailed(input, options);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe(input);
  });

  it("ignores a stale reference parser context for a different source", () => {
    const source = '<ref name="foo"/>\n';
    expect(
      formatReferences(source, session.createContext("Plain text\n"))
        .formatted,
    ).toBe('<ref name="foo" />\n');
  });

  it.each([
    "<ref>content</ref>\n",
    '<ref name="x">content</ref>\n',
    "Text<ref>content</ref>\n",
    "<ref>{{Citation|title=Example}}</ref>\n",
    "<ref>\nmultiline\n</ref>\n",
    '<ref name="{{x}}" />\n',
    '<ref name="[[x]]" />\n',
    '<!-- <ref name="x"/> -->\n',
  ])("preserves unsafe reference line %s", (input) => {
    expect(formatWikitext(input, options)).toBe(input);
  });

  it("is idempotent", () => {
    const once = formatWikitext(
      '<references group="note"/>\n<ref name="foo"/>\n',
      options,
    );
    expect(formatWikitext(once, options)).toBe(once);
  });

  it("reports reference diagnostics", () => {
    const result = formatWikitextDetailedResult(
      '<references group="note"/>\n<ref name="foo"/>\n<ref>content</ref>\n',
      options,
    );
    expect(result.referenceDiagnostics).toEqual({
      referencesFormatted: 2,
      referenceGroupsFormatted: 1,
      referenceLinesSkippedUnsafe: 1,
    });
  });

  it.each([
    ['Text<ref name="x"/>.', 'Text<ref name="x" />.'],
    [`Text <ref name="O'Brien"/>\n`, `Text <ref name="O'Brien" />\n`],
    [
      `<ref name="O'Brien"/><ref name='a"b'/>\n`,
      `<ref name="O'Brien" /><ref name='a"b' />\n`,
    ],
    ['A<REF name="x"/>B<ref name="x"/>C  \n', 'A<ref name="x" />B<ref name="x" />C  \n'],
    ['<span><ref name="x"/></span>\n', '<span><ref name="x" /></span>\n'],
    ['| <ref name="x"/>\n', '| <ref name="x" />\n'],
    ['* Item<ref name="x"/>\n', '* Item<ref name="x" />\n'],
    ['  <ref name="x"/>  \n', '  <ref name="x" />  \n'],
    ['<!-- note --><ref name="x"/>\n', '<!-- note --><ref name="x" />\n'],
    ['[[Page]]<ref name="x"/>\n', '[[Page]]<ref name="x" />\n'],
    ['Text<references group="note"/>\n', 'Text<references group="note" />\n'],
  ])("formats parser-confirmed inline references %s", (input, expected) => {
    expect(formatReferences(input, session.createContext(input)).formatted).toBe(expected);
    const result = formatWikitextSafeDetailed(input, options);
    expect(result.failure).toBeUndefined();
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(expected);
    expect(result.referenceDiagnostics.referenceLinesSkippedUnsafe).toBe(0);
    const canonical = formatWikitextSafeDetailed(expected, options);
    expect(canonical.failure).toBeUndefined();
    expect(canonical.formatted).toBe(expected);
    expect(canonical.referenceDiagnostics.referencesFormatted).toBe(0);
  });

  it("requires current parser confirmation for inline and multiple references", () => {
    for (const input of ['Text<ref name="x"/>\n', '<ref name="x"/><ref name="y"/>\n']) {
      expect(formatReferences(input).formatted).toBe(input);
      expect(formatReferences(input, session.createContext("Other text\n")).formatted).toBe(input);
    }
  });

  it("preserves inline CRLF and the reference option and reliability gates", () => {
    const input = 'Text<ref name="x"/>\r\nMore<ref name="y"/>\r\n';
    const result = formatWikitextSafeDetailed(input, { profile: "production" });
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe('Text<ref name="x" />\r\nMore<ref name="y" />\r\n');
    expect(formatWikitext(input)).toBe(input);
    expect(formatWikitext(input, { ...options, level: "safe" })).toBe(input);
    expect(formatWikitext(input, { profile: "production", formatReferences: false })).toBe(input);
  });

  it("counts formatted tags separately and unsafe lines once", () => {
    const input = 'Text<ref name="x"/><ref name="y"/> <references/>\n' +
      'Other<ref>body</ref><ref>more</ref>\n';
    const result = formatWikitextSafeDetailed(input, options);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe('Text<ref name="x" /><ref name="y" /> <references />\n' +
      'Other<ref>body</ref><ref>more</ref>\n');
    expect(result.referenceDiagnostics).toEqual({
      referencesFormatted: 3,
      referenceGroupsFormatted: 1,
      referenceLinesSkippedUnsafe: 1,
    });
  });

  it("honors a single inline ignore marker without hiding later references", () => {
    const input = '<!-- wikitext-fmt-ignore --> <ref name="x"/> <ref name="y"/>\n';
    const result = formatWikitextSafeDetailed(input, options);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toBe('<!-- wikitext-fmt-ignore --> <ref name="x"/> <ref name="y" />\n');
    expect(result.referenceDiagnostics.referencesFormatted).toBe(1);
  });

  it.each([
    '{{T|value=Text<ref name="x"/>}}\n',
    '[[Page|Text<ref name="x"/>]]\n',
    '==Title<ref name="x"/>==\n',
    '<span title=\'<ref name="x"/>\'>Text</span>\n',
    '{|\n| Text<ref name="x"/>\n|}\n',
    '<nowiki>Text<ref name="x"/></nowiki>\n',
    '<!-- Text<ref name="x"/> -->\n',
    '<!-- wikitext-fmt-ignore-start -->\nText<ref name="x"/>\n<!-- wikitext-fmt-ignore-end -->\n',
    'Text<ref><ref name="x"/></ref>\n',
    'Text<ref name="x"\n/>\n',
    'Text<ref name="{{T}}"/>\n',
    'Text<ref name="unclosed/>\n',
  ])("preserves nested, protected, or ambiguous inline references %s", (input) => {
    const result = formatWikitextSafeDetailed(input, {
      ...options,
      formatTemplates: false,
      formatHeadings: false,
    });
    expect(result.formatted).toBe(input);
  });
});

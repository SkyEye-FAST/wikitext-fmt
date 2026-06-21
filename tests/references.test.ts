import { describe, expect, it } from "vitest";
import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";

const options = {
  level: "experimental" as const,
  formatReferences: true,
};

describe("experimental reference formatting", () => {
  it("is disabled by default", () => {
    expect(formatWikitext("<references/>\n")).toBe("<references/>\n");
  });

  it("requires experimental level and explicit option", () => {
    expect(formatWikitext("<references/>\n", { formatReferences: true })).toBe(
      "<references/>\n",
    );
    expect(formatWikitext("<references/>\n", { level: "experimental" })).toBe(
      "<references/>\n",
    );
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

  it.each([
    "<ref>content</ref>\n",
    '<ref name="x">content</ref>\n',
    "Text<ref>content</ref>\n",
    'Text <ref name="x" />\n',
    "<ref>{{Citation|title=Example}}</ref>\n",
    "<ref>\nmultiline\n</ref>\n",
    '<ref name="x" /><ref name="y" />\n',
    '<ref name="{{x}}" />\n',
    '<ref name="[[x]]" />\n',
    '<!-- <ref name="x"/> -->\n',
    '<span><ref name="x"/></span>\n',
    '| <ref name="x"/>\n',
    '* <ref name="x"/>\n',
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
});

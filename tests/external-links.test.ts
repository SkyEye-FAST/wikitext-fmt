import { describe, expect, it } from "vitest";

import { formatWikitext, formatWikitextDetailedResult } from "../src/index.js";
import { createNodeParserSession, getParserConfig } from "../src/parser.js";
import { formatExternalLinks } from "../src/rules/externalLinks.js";

const options = {
  level: "normal" as const,
  formatExternalLinks: true,
};
const config = getParserConfig("mediawiki");
const session = createNodeParserSession(config);

describe("external link formatting", () => {
  it("is disabled by default", () => {
    expect(formatWikitext("[https://example.com  Label]\n")).toBe(
      "[https://example.com  Label]\n",
    );
  });

  it("requires normal level and an explicit option outside production", () => {
    expect(
      formatWikitext("[https://example.com  Label]\n", {
        formatExternalLinks: true,
      }),
    ).toBe("[https://example.com Label]\n");
    expect(
      formatWikitext("[https://example.com  Label]\n", {
        level: "safe",
        formatExternalLinks: true,
      }),
    ).toBe("[https://example.com  Label]\n");
  });

  it("is enabled by the production profile and can be disabled", () => {
    const input = "[https://example.com  Label]\n";
    expect(formatWikitext(input, { profile: "production" })).toBe(
      "[https://example.com Label]\n",
    );
    expect(
      formatWikitext(input, {
        profile: "production",
        formatExternalLinks: false,
      }),
    ).toBe(input);
  });

  it.each([
    ["[https://example.com  Label]\n", "[https://example.com Label]\n"],
    ["[https://example.com\t\tLabel]\n", "[https://example.com Label]\n"],
    ["[mailto:test@example.com  Mail]\n", "[mailto:test@example.com Mail]\n"],
    [
      "[//example.com  Protocol-relative]\n",
      "[//example.com Protocol-relative]\n",
    ],
  ])("formats standalone labeled external link %s", (input, expected) => {
    expect(formatWikitext(input, options)).toBe(expected);
  });

  it.each([
    "[https://example.com]\n",
    "Text [https://example.com  Label] text\n",
    "[https://example.com Label]\n",
    "[https://example.com  {{Label}}]\n",
    "[https://example.com  [[Label]]]\n",
    "[https://example.com  <span>Label</span>]\n",
    "[https://example.com  Label] [https://example.org  Other]\n",
    "[https://example.com  Label\n",
    "* [https://example.com  Label]\n",
    "<ref>[https://example.com  Label]</ref>\n",
    "{|\n| [https://example.com  Label]\n|}\n",
    "{{T|x=[https://example.com  Label]}}\n",
  ])("preserves unsupported external link case %s", (input) => {
    expect(formatWikitext(input, { ...options, formatTemplates: false })).toBe(
      input,
    );
  });

  it("is idempotent", () => {
    const once = formatWikitext("[https://example.com  Label]\n", options);
    expect(formatWikitext(once, options)).toBe(once);
  });

  it("reports external link diagnostics", () => {
    const result = formatWikitextDetailedResult(
      "[https://example.com  Label]\n[https://example.org]\n",
      options,
    );
    expect(result.externalLinkDiagnostics).toEqual({
      externalLinksFormatted: 1,
      externalLinksSkippedUnsafe: 1,
    });
  });

  it("uses parser-confirmed whole-line external links when context is provided", () => {
    const source = "[https://example.com  Label]\n";
    expect(
      formatExternalLinks(source, session.createContext(source))
        .formatted,
    ).toBe("[https://example.com Label]\n");
  });

  it("ignores a stale external-link parser context safely", () => {
    const source = "[https://example.com  Label]\n";
    expect(
      formatExternalLinks(source, session.createContext("Plain text\n"))
        .formatted,
    ).toBe(source);
  });
});

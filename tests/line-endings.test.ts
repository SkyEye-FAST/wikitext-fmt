import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  formatWikitext,
  formatWikitextDetailedResult,
  formatWikitextResult,
  formatWikitextSafe,
  formatWikitextSafeDetailed,
  verifyStructuralEquivalence,
} from "../src/index.js";
import { resolveOptions } from "../src/options.js";
import { getParserConfig } from "../src/parser.js";

const config = getParserConfig("mediawiki");
const resolved = resolveOptions({});
const fixturesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

function toCrlf(source: string): string {
  return source.replaceAll("\n", "\r\n");
}

function expectOnlyCrlf(source: string): void {
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) {
      expect(source.charCodeAt(index - 1)).toBe(13);
    }
    if (source.charCodeAt(index) === 13) {
      expect(source.charCodeAt(index + 1)).toBe(10);
    }
  }
  expect(source).not.toContain("\r\r\n");
}

function expectCrlfFormattingMatchesLf(source: string): void {
  const lf = formatWikitextDetailedResult(source);
  expect(lf.failure).toBeUndefined();

  const crlfSource = toCrlf(source);
  const expected = toCrlf(lf.formatted);
  const detailed = formatWikitextDetailedResult(crlfSource);
  expect(detailed.failure).toBeUndefined();
  expect(detailed.warning).toBeUndefined();
  expect(detailed.formatted).toBe(expected);
  expectOnlyCrlf(detailed.formatted);

  const safe = formatWikitextSafeDetailed(crlfSource);
  expect(safe.failure).toBeUndefined();
  expect(safe.warning).toBeUndefined();
  expect(safe.formatted).toBe(expected);
  expect(formatWikitextSafeDetailed(safe.formatted).formatted).toBe(expected);
  expect(
    verifyStructuralEquivalence(
      crlfSource,
      detailed.formatted,
      config,
      "document",
      resolved,
    ),
  ).toEqual({ equivalent: true, structure: "document" });
}

describe("line-ending normalization envelope", () => {
  it("preserves LF, no-EOL, empty, and final-newline-only inputs", () => {
    expect(formatWikitext("==Title==\nText\n")).toBe("== Title ==\nText\n");
    expect(formatWikitext("==Title==")).toBe("== Title ==");
    expect(formatWikitext("")).toBe("");
    expect(formatWikitext("\n")).toBe("\n");
    expect(formatWikitext("\r\n")).toBe("\r\n");
  });

  it("supports CRLF through every public formatter result shape", () => {
    const source = "==Title==\r\nText\r\n";
    const expected = "== Title ==\r\nText\r\n";
    expect(formatWikitext(source)).toBe(expected);
    const compact = formatWikitextResult(source);
    expect(compact.formatted).toBe(expected);
    expect(compact.failure).toBeUndefined();
    expect(compact.warning).toBeUndefined();
    const detailed = formatWikitextDetailedResult(source);
    expect(detailed.formatted).toBe(expected);
    expect(detailed.failure).toBeUndefined();
    expect(detailed.warning).toBeUndefined();
    const safeCompact = formatWikitextSafe(source);
    expect(safeCompact.formatted).toBe(expected);
    expect(safeCompact.failure).toBeUndefined();
    expect(safeCompact.warning).toBeUndefined();
    const safeDetailed = formatWikitextSafeDetailed(source);
    expect(safeDetailed.formatted).toBe(expected);
    expect(safeDetailed.failure).toBeUndefined();
    expect(safeDetailed.warning).toBeUndefined();
    expectOnlyCrlf(expected);
  });

  it.each([
    [
      "lists and comments",
      ":item\n:*item\n:c<!-- x -->\n:{{T}}\n",
    ],
    ["single-line named template", "{{T|a=1}}\n"],
    ["anonymous parameters", "{{T|one|two}}\n"],
    [
      "multiline nested template",
      "{{Outer\n| first = alpha\n| nested = {{Inner|x=1|y=2}}\n}}\n",
    ],
    [
      "nested navbox and template list",
      "{{navbox\n| name = Test\n| group1 = Alpha\n| list1 =\n*One\n*:Two\n}}\n",
    ],
    [
      "table inside a template",
      "{{Box\n| table =\n{|\n! A !! B\n|}\n| note = kept\n}}\n",
    ],
    ["wiki table", '{| class="wikitable"\n! A !! B\n| A || B\n|}\n'],
    [
      "protected blocks and ignore ranges",
      [
        "<nowiki>\n:c\n</nowiki>",
        "<pre>\n:c\n</pre>",
        '<syntaxhighlight lang="text">\n:c\n</syntaxhighlight>',
        "<source>\n:c\n</source>",
        "<math>\n:c\n</math>",
        "<chem>\n:c\n</chem>",
        "<gallery>\n:c\n</gallery>",
        "<templatedata>\n:c\n</templatedata>",
        "<ref>\n:c\n</ref>",
        "<!-- ordinary comment\n:c\n-->",
        "<!-- wikitext-fmt-ignore-start -->\n:c\n<!-- wikitext-fmt-ignore-end -->",
        "",
      ].join("\n"),
    ],
    [
      "footer metadata",
      "Body\n[[Category:A]]\n{{DEFAULTSORT:Key}}\n__NOTOC__\n[[en:Page]]\n",
    ],
    ["redirect", "#redirect[[Target]]\n"],
  ])("preserves CRLF while formatting %s", (_name, source) => {
    expectCrlfFormattingMatchesLf(source);
  });

  it("maps table diagnostics back to original CRLF offsets including EOF", () => {
    const source = "Lead\r\n{|\r\n| A || B\r\n|}";
    const result = formatWikitextDetailedResult(source);
    expect(result.failure).toBeUndefined();
    expect(result.tableDiagnostics).toHaveLength(1);
    expect(result.tableDiagnostics[0]).toMatchObject({
      start: source.indexOf("{|"),
      end: source.length,
      line: 2,
    });
    expect(result.tableDiagnostics[0]?.lineDiagnostics?.[0]?.sourceLine).toBe(3);
  });

  it.each([
    ["mixed LF and CRLF", "==Title==\r\nText\n", "mixed LF and CRLF"],
    ["bare CR", "==Title==\rText", "bare carriage returns"],
    ["CRLF and bare CR", "==Title==\r\nText\rTail", "bare carriage returns"],
  ])("fails closed for %s", (_name, source, message) => {
    const detailed = formatWikitextDetailedResult(source);
    expect(detailed.formatted).toBe(source);
    expect(detailed.failure).toMatchObject({
      code: "unsupported-line-endings",
      stage: "input-normalization",
      message: expect.stringContaining(message),
    });

    const safe = formatWikitextSafeDetailed(source);
    expect(safe.formatted).toBe(source);
    expect(safe.failure).toMatchObject({
      code: "unsupported-line-endings",
      stage: "input-normalization",
    });
  });

  it("reads and formats a repository fixture with real CRLF bytes", async () => {
    const lfDirectory = resolve(
      fixturesRoot,
      "regression-structured-lists",
    );
    const crlfDirectory = resolve(
      fixturesRoot,
      "regression-structured-lists-crlf",
    );
    const [lfInput, lfExpected, crlfInput, crlfExpected] = await Promise.all([
      readFile(resolve(lfDirectory, "input.wiki"), "utf8"),
      readFile(resolve(lfDirectory, "expected.wiki"), "utf8"),
      readFile(resolve(crlfDirectory, "input.wiki"), "utf8"),
      readFile(resolve(crlfDirectory, "expected.wiki"), "utf8"),
    ]);

    expect(lfInput).not.toContain("\r");
    expect(lfExpected).not.toContain("\r");
    expect(crlfInput).toContain("\r\n");
    expect(crlfExpected).toContain("\r\n");
    expectOnlyCrlf(crlfInput);
    expectOnlyCrlf(crlfExpected);

    const detailed = formatWikitextDetailedResult(crlfInput);
    expect(detailed.failure).toBeUndefined();
    expect(detailed.formatted).toBe(crlfExpected);
    expect(detailed.formatted).toBe(toCrlf(lfExpected));
    expect(detailed.formatted).toContain("{{Template|a=1}}");
    expect(detailed.formatted).toContain("[[Target|label]]");
    expect(detailed.formatted).toContain('<span class="x">text</span>');
    expect(detailed.formatted).toContain(
      '<ref name="x">source</ref>',
    );
    expect(detailed.formatted).toContain("<!-- ordinary comment -->");
    expect(detailed.formatted).toContain(
      "<!-- wikitext-fmt-ignore -->\r\n:c\r\n",
    );
    expect(detailed.formatted).toContain("<nowiki>\r\n:c\r\n</nowiki>");
    expect(detailed.formatted).toContain("<pre>\r\n:c\r\n</pre>");
    expect(detailed.formatted).toContain("{|\r\n| :c\r\n|}");

    const safe = formatWikitextSafeDetailed(crlfInput);
    expect(safe.failure).toBeUndefined();
    expect(safe.formatted).toBe(crlfExpected);
    expect(formatWikitext(safe.formatted)).toBe(crlfExpected);
    expect(
      verifyStructuralEquivalence(
        crlfInput,
        crlfExpected,
        config,
        "document",
        resolved,
      ),
    ).toEqual({ equivalent: true, structure: "document" });
  });
});

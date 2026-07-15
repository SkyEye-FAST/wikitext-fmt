import { describe, expect, it } from "vitest";
import {
  formatWikitextSafeDetailed,
  type FormatOptions,
} from "../src/index.js";
import {
  tableStructuralFingerprint,
  templateStructuralFingerprint,
  verifyStructuralEquivalence,
} from "../src/equivalence.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";

const config = getParserConfig("mediawiki");
const production: FormatOptions = { profile: "production" };

function expectGraduatedCase(
  input: string,
  fingerprint: (source: string, config: typeof config) => string,
): void {
  expect(() => parseWikitext(input, config)).not.toThrow();
  const once = formatWikitextSafeDetailed(input, production);
  expect(once.warning).toBeUndefined();
  expect(() => parseWikitext(once.formatted, config)).not.toThrow();
  expect(once.formatted).not.toBe(input);
  expect(fingerprint(once.formatted, config)).toBe(fingerprint(input, config));
  const twice = formatWikitextSafeDetailed(once.formatted, production);
  expect(twice.warning).toBeUndefined();
  expect(twice.formatted).toBe(once.formatted);
  expect(
    once.equivalenceDiagnostics.every((entry) => entry.equivalent),
  ).toBe(true);
}

describe("generated graduated template matrix", () => {
  const parameters = [
    ["named", "name=", "value"],
    ["anonymous", "", "anonymous value"],
    ["numeric", "2=", "numeric value"],
    ["empty", "empty=", ""],
    ["unicode", "中文参数=", "日本語の値"],
  ] as const;
  const values = [
    ["nested template", "{{Inner|x=1|y=2}}"],
    ["parser function", "{{#if:x|yes|no}}"],
    ["wikilink", "[[Page|label]]"],
    ["external link", "[https://example.test label]"],
    ["reference", "<ref name=source>citation</ref>"],
    ["HTML", "<span lang=ja>値</span>"],
    ["comment", "value<!-- between -->"],
    ["multiline", "first line\nsecond line"],
  ] as const;

  for (const [kind, prefix, defaultValue] of parameters) {
    for (const [valueKind, structuredValue] of values) {
      it(`${kind} parameter with ${valueKind}`, () => {
        const value = kind === "empty" ? defaultValue : structuredValue;
        const input = `Lead {{Matrix|first=alpha|${prefix}${value}|last=omega}} tail\n`;
        expectGraduatedCase(input, templateStructuralFingerprint);
      });
    }
  }

  it("formats templates inside table cells", () => {
    expectGraduatedCase(
      "{|\n| {{Matrix|first=alpha|nested={{Inner|x=1|y=2}}|last=omega}}\n|}\n",
      templateStructuralFingerprint,
    );
  });
});

describe("generated graduated table matrix", () => {
  const rowKinds = [
    ["header", "!", "!!"],
    ["data", "|", "||"],
  ] as const;
  const attributeKinds = [
    ["plain", ""],
    ["attributes", ' class="matrix" | '],
  ] as const;
  const contents = [
    ["templates", "{{Cell|x=1}}", "{{#if:x|yes|no}}"],
    ["links", "[[Page|label]]", "[https://example.test label]"],
    ["tags", "<span>HTML</span>", "<ref>citation || opaque</ref>"],
    ["empty and unicode", "", "日本語"],
  ] as const;

  for (const [rowKind, marker, separator] of rowKinds) {
    for (const [attributeKind, attributes] of attributeKinds) {
      for (const [contentKind, first, second] of contents) {
        it(`${rowKind}, ${attributeKind}, ${contentKind}`, () => {
          const input = [
            '{| class="wikitable"',
            "|+ Matrix caption",
            `${marker}${attributes}${first} ${separator} ${second}`,
            "|}",
            "",
          ].join("\n");
          expectGraduatedCase(input, tableStructuralFingerprint);
        });
      }
    }
  }

  it("formats nested tables deepest-first", () => {
    expectGraduatedCase(
      "{|\n| outer\n{|\n| A || B\n|}\n| tail || end\n|}\n",
      tableStructuralFingerprint,
    );
  });

  it("formats a table embedded in template text", () => {
    expectGraduatedCase(
      "{{Box\n| table =\n{|\n! A !! B\n|-\n| rowspan=2 | X || Y\n|}\n| note = kept\n}}\n",
      tableStructuralFingerprint,
    );
  });

  it("preserves continuation lines and comments while splitting cells", () => {
    expectGraduatedCase(
      "{|\n<!-- row comment -->\n| first line\ncontinued text\n|-\n| A || B\n|}\n",
      tableStructuralFingerprint,
    );
  });
});

describe("structural equivalence rejection", () => {
  it("detects template parameter reordering", () => {
    expect(
      verifyStructuralEquivalence(
        "{{T|a=1|b=2}}",
        "{{T|b=2|a=1}}",
        config,
        "templates",
      ),
    ).toMatchObject({ equivalent: false, structure: "templates" });
  });

  it("detects table cell type and content changes", () => {
    expect(
      verifyStructuralEquivalence(
        "{|\n! A !! B\n|}",
        "{|\n| A || changed\n|}",
        config,
        "tables",
      ),
    ).toMatchObject({ equivalent: false, structure: "tables" });
  });
});

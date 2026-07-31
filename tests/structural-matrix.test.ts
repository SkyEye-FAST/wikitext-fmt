import { describe, expect, it } from "vitest";

import {
  tableStructuralFingerprint,
  templateStructuralFingerprint,
  verifyStructuralEquivalence,
} from "../src/equivalence.js";
import {
  type FormatOptions,
  formatWikitextSafeDetailed,
} from "../src/index.js";
import { resolveOptions } from "../src/options.js";
import { getParserConfig, parseWikitext } from "../src/parser.js";

const config = getParserConfig("mediawiki");
const production: FormatOptions = { profile: "production" };

function expectGraduatedCase(
  input: string,
  fingerprint: (
    source: string,
    config: ReturnType<typeof getParserConfig>,
  ) => string,
): void {
  expect(() => parseWikitext(input, config)).not.toThrow();
  const once = formatWikitextSafeDetailed(input, production);
  expect(once.warning).toBeUndefined();
  expect(() => parseWikitext(once.formatted, config)).not.toThrow();
  expect(fingerprint(once.formatted, config)).toBe(fingerprint(input, config));
  const twice = formatWikitextSafeDetailed(once.formatted, production);
  expect(twice.warning).toBeUndefined();
  expect(twice.formatted).toBe(once.formatted);
  expect(once.equivalenceDiagnostics.every((entry) => entry.equivalent)).toBe(
    true,
  );
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

  it("preserves inline table templates that emit table syntax", () => {
    const input = [
      "{|",
      "| <pre>{{Loop|5|{{!}}{{!}}abc}}</pre>",
      "| {{Loop|5|{{!}}{{!}}abc}}",
      "|}",
      "",
    ].join("\n");
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toContain("{{Loop|5|{{!}}{{!}}abc}}");
  });

  it("formats multiple templates adjacent to ordinary prose", () => {
    expectGraduatedCase(
      "Lead {{First|a=1|b=2}} middle {{Second|x=3|y=4}} tail\n",
      templateStructuralFingerprint,
    );
  });

  it("formats multiple nested template depths", () => {
    expectGraduatedCase(
      "{{Outer|a=1|nested={{Middle|b=2|nested={{Inner|c=3|d=4}}}}}}\n",
      templateStructuralFingerprint,
    );
  });

  it.each([
    ["heading", "=== Nested heading ==="],
    ["list", "* First item\n* Second item"],
  ])("preserves line-sensitive %s parameter values", (_name, value) => {
    const input = `{{Container|before=alpha|content=\n${value}\n|after=omega}}\n`;
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).toContain(`| content =\n${value}\n`);
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
  const documentOptions = resolveOptions({
    profile: "aggressive",
    behaviorSwitchPlacement: "footer",
    interlanguagePlacement: "footer",
  });

  it.each([
    ["links", "[[Target|Label]]", "[[Changed|Label]]"],
    [
      "files",
      "[[File:A.png|thumb|Caption]]",
      "[[File:A.png|thumb|Changed caption]]",
    ],
    [
      "references",
      '<ref name="a">content</ref>',
      '<ref name="a">changed</ref>',
    ],
    ["categories", "[[Category:A|one]]", "[[Category:A|two]]"],
    ["redirects", "#REDIRECT [[Target]]", "#REDIRECT [[Changed]]"],
    ["headings", "== Heading ==", "=== Heading ==="],
    ["behaviorSwitches", "__NOTOC__", "__TOC__"],
    ["comments", ": item<!-- a -->", ": item<!-- b -->"],
  ])("detects changed document %s", (category, before, after) => {
    expect(
      verifyStructuralEquivalence(
        before,
        after,
        config,
        "document",
        documentOptions,
      ),
    ).toMatchObject({
      equivalent: false,
      structure: "document",
      reason: `${category} semantic fingerprint changed`,
    });
  });

  it.each([
    [": item\n", ":* item\n"],
    [":* item\n", "*: item\n"],
    [": before{{T}}after\n", ": after{{T}}before\n"],
    [": before<!-- c -->after\n", ": after<!-- c -->before\n"],
  ])("rejects list hierarchy, marker, or structured-child movement", (
    before,
    after,
  ) => {
    expect(
      verifyStructuralEquivalence(
        before,
        after,
        config,
        "document",
        documentOptions,
      ),
    ).toMatchObject({ equivalent: false, structure: "document" });
  });

  it.each([
    ["heading spacing", "==Title==\n"],
    ["blank lines", "Text\n\n\n\nMore\n"],
    ["list spacing", "*item   \n"],
    ["file syntax", "[[ファイル:A.png|サムネイル|右]]   \n"],
    ["reference syntax", "<references/>\n"],
    ["external-link syntax", "[https://example.com   Label]\n"],
    ["redirect syntax", "#redirect[[Target]]\n"],
    ["HTML void syntax", "<br />\n"],
    ["footer syntax", "[[Category:A]]\nBody\n__NOTOC__\n"],
  ])("accepts supported syntax-only normalization: %s", (_name, before) => {
    const result = formatWikitextSafeDetailed(before, {
      ...documentOptions,
      localizedSyntaxStyle: "canonical-english",
    });
    expect(result.failure).toBeUndefined();
    expect(result.equivalenceDiagnostics.at(-1)).toEqual({
      equivalent: true,
      structure: "document",
    });
  });

  it.each([
    [":c<!-- exact comment -->\n", ": c<!-- exact comment -->\n"],
    [":<!-- exact comment -->content\n", ": <!-- exact comment -->content\n"],
    [":*{{T}}<!-- c -->\n", ":* {{T}}<!-- c -->\n"],
    [":[[Page|label]]\n", ": [[Page|label]]\n"],
    [":<ref>source</ref>\n", ": <ref>source</ref>\n"],
    [":<span>text</span>\n", ": <span>text</span>\n"],
  ])("accepts parser-confirmed list-prefix layout with structured content", (
    before,
    after,
  ) => {
    expect(
      verifyStructuralEquivalence(
        before,
        after,
        config,
        "document",
        documentOptions,
      ),
    ).toEqual({ equivalent: true, structure: "document" });
  });

  it("accepts template layout changes inside an external-link label", () => {
    const input =
      "[https://example.test label {{LongTemplateName|first=alpha|second=beta}}]\n";
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).not.toBe(input);
    expect(result.equivalenceDiagnostics.at(-1)).toEqual({
      equivalent: true,
      structure: "document",
    });
  });

  it.each([
    [
      "heading",
      "== {{HeadingLabel|first=alpha|second=beta}} ==\n",
    ],
    [
      "file caption",
      "[[File:Example.png|thumb|{{Caption|first=alpha|second=beta}}]]\n",
    ],
    [
      "HTML content",
      "<span>{{Label|first=alpha|second=beta}}</span>\n",
    ],
  ])("accepts template layout changes inside %s semantics", (_name, input) => {
    const result = formatWikitextSafeDetailed(input, production);
    expect(result.failure).toBeUndefined();
    expect(result.formatted).not.toBe(input);
  });

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

  it.each([
    ["cell leading whitespace", "{|\n|  A\n|}", "{|\n| A\n|}"],
    ["cell trailing whitespace", "{|\n| A  \n|}", "{|\n| A\n|}"],
    [
      "preformatted content",
      "{|\n| <pre>  A  </pre>\n|}",
      "{|\n| <pre>A</pre>\n|}",
    ],
    ["comment", "{|\n| A<!--keep-->\n|}", "{|\n| A\n|}"],
    ["table attributes", '{| class="x"\n| A\n|}', "{|\n| A\n|}"],
    ["row attributes", "{|\n|- class=x\n| A\n|}", "{|\n|-\n| A\n|}"],
    ["cell attributes", "{|\n| class=x | A\n|}", "{|\n| class=y | A\n|}"],
    ["caption", "{|\n|+ First\n| A\n|}", "{|\n|+ Second\n| A\n|}"],
    [
      "anonymous template whitespace in a cell",
      "{|\n| {{T| foo }}\n|}",
      "{|\n| {{T|foo}}\n|}",
    ],
  ])("detects changed %s", (_name, before, after) => {
    expect(
      verifyStructuralEquivalence(before, after, config, "tables"),
    ).toMatchObject({ equivalent: false, structure: "tables" });
  });

  it.each([
    ["anonymous leading space", "{{T| foo}}", "{{T|foo}}"],
    ["anonymous trailing space", "{{T|foo }}", "{{T|foo}}"],
    ["anonymous empty value", "{{T||foo}}", "{{T|foo}}"],
    ["anonymous order", "{{T|one|two}}", "{{T|two|one}}"],
    ["comment", "{{T|one<!--keep-->|two}}", "{{T|one|two}}"],
    ["parser-function value", "{{#if:x|yes|no}}", "{{#if: x|yes|no}}"],
  ])("detects a changed %s", (_name, before, after) => {
    expect(
      verifyStructuralEquivalence(before, after, config, "templates"),
    ).toMatchObject({ equivalent: false, structure: "templates" });
  });

  it("accepts syntax-only named parameter spacing", () => {
    expect(
      verifyStructuralEquivalence(
        "{{T| name = value }}",
        "{{T|name=value}}",
        config,
        "templates",
      ),
    ).toEqual({ equivalent: true, structure: "templates" });
  });
});

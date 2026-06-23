import Parser from "wikiparser-node";
import { describe, expect, it } from "vitest";
import { getParserConfig } from "../src/parser.js";
import {
  collectNodes,
  createParserContext,
  isNodeWholeLine,
  lineIndexAt,
  lineRangeAt,
  lineTextAt,
  nodeRange,
} from "../src/parserContext.js";

const config = getParserConfig("mediawiki");

function summarize(source: string) {
  const root = Parser.parse(source, false, undefined, config);
  const summary: Array<{
    type: string | undefined;
    className: string;
    index: number | undefined;
    text: string;
  }> = [];
  const visit = (node: typeof root) => {
    summary.push({
      type: node.type,
      className: node.constructor.name,
      index:
        typeof node.getAbsoluteIndex === "function"
          ? node.getAbsoluteIndex()
          : undefined,
      text: node.toString(),
    });
    for (const child of node.childNodes ?? []) visit(child as typeof root);
  };
  visit(root);
  return summary;
}

describe("parser AST capabilities for metadata-like rules", () => {
  it("provides shared source range and line utilities for parser-assisted rules", () => {
    const source = "Lead\n[[Category:Foo]]\nTail";
    const context = createParserContext(source, config);
    const [category] = collectNodes(context, "category");
    expect(category).toBeTruthy();
    expect(nodeRange(category!)).toEqual({ start: 5, end: 21 });
    expect(isNodeWholeLine(context, category!)).toBe(true);
    expect(lineIndexAt(context, nodeRange(category!).start)).toBe(1);
    expect(lineRangeAt(context, 1)).toEqual({ start: 5, end: 21 });
    expect(lineTextAt(context, 1)).toBe("[[Category:Foo]]");
  });

  it("exposes category, defaultsort, and interlanguage-like link nodes", () => {
    expect(summarize("[[Category:Foo|Bar]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "category",
          className: "CategoryToken",
          index: 0,
          text: "[[Category:Foo|Bar]]",
        }),
      ]),
    );
    expect(summarize("[[Category:Foo|Sort]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "category",
          className: "CategoryToken",
          index: 0,
          text: "[[Category:Foo|Sort]]",
        }),
      ]),
    );
    expect(summarize("{{DEFAULTSORT:Foo}}")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "magic-word",
          className: "TranscludeToken",
          index: 0,
          text: "{{DEFAULTSORT:Foo}}",
        }),
      ]),
    );
    expect(summarize("{{DEFAULTSORTKEY:Foo}}")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "magic-word",
          className: "TranscludeToken",
          index: 0,
          text: "{{DEFAULTSORTKEY:Foo}}",
        }),
      ]),
    );
    expect(summarize("[[en:Foo]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          className: "LinkToken",
          index: 0,
          text: "[[en:Foo]]",
        }),
      ]),
    );
    expect(summarize("[[分類:Foo]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "category",
          className: "CategoryToken",
          index: 0,
          text: "[[分類:Foo]]",
        }),
      ]),
    );
    expect(summarize("Text [[Category:Inline]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "category",
          index: 5,
          text: "[[Category:Inline]]",
        }),
      ]),
    );
    expect(summarize("{{T|x=[[Category:Inside]]}}")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "category",
          text: "[[Category:Inside]]",
        }),
      ]),
    );
    expect(summarize("__NOTOC__")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "behavior-switch" }),
      ]),
    );
  });

  it("supports whole-line checks for category nodes but not embedded categories", () => {
    const wholeLine = createParserContext("[[Category:A]]\n", config);
    const [wholeLineCategory] = collectNodes(wholeLine, "category");
    expect(wholeLineCategory).toBeTruthy();
    expect(isNodeWholeLine(wholeLine, wholeLineCategory!)).toBe(true);

    const inline = createParserContext("Text [[Category:Inline]]\n", config);
    const [inlineCategory] = collectNodes(inline, "category");
    expect(inlineCategory).toBeTruthy();
    expect(isNodeWholeLine(inline, inlineCategory!)).toBe(false);

    const nested = createParserContext("{{T|x=[[Category:Inside]]}}\n", config);
    const [nestedCategory] = collectNodes(nested, "category");
    expect(nestedCategory).toBeTruthy();
    expect(isNodeWholeLine(nested, nestedCategory!)).toBe(false);
  });

  it("exposes file-link nodes and ranges but line-level validation remains necessary", () => {
    expect(summarize("[[File:Example.png|thumb|right|300px|Caption]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          className: "FileToken",
          index: 0,
          text: "[[File:Example.png|thumb|right|300px|Caption]]",
        }),
        expect.objectContaining({ type: "image-parameter", text: "thumb" }),
      ]),
    );
    expect(summarize("[[:File:Example.png]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          text: "[[:File:Example.png]]",
        }),
      ]),
    );
    expect(summarize("Text [[File:Example.png|thumb]] here")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          index: 5,
          text: "[[File:Example.png|thumb]]",
        }),
      ]),
    );
    expect(summarize("[[文件:Example.png|缩略图]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "file",
          className: "FileToken",
          index: 0,
        }),
        expect.objectContaining({ type: "image-parameter", text: "缩略图" }),
      ]),
    );
    expect(summarize("[[Page|Caption]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          className: "LinkToken",
          index: 0,
          text: "[[Page|Caption]]",
        }),
      ]),
    );
  });

  it("exposes reference extension nodes but source text is still needed for self-closing safety", () => {
    expect(summarize('<references group="note"/>')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext",
          className: "ExtToken",
          index: 0,
          text: '<references group="note"/>',
        }),
      ]),
    );
    expect(summarize('<ref name="foo">content</ref>')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext",
          className: "ExtToken",
          index: 0,
          text: '<ref name="foo">content</ref>',
        }),
        expect.objectContaining({ type: "ext-inner", text: "content" }),
      ]),
    );
    expect(summarize('<ref name="foo"/>')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext",
          className: "ExtToken",
          index: 0,
          text: '<ref name="foo"/>',
        }),
      ]),
    );
    expect(summarize('Text <ref name="foo"/>')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext",
          index: 5,
          text: '<ref name="foo"/>',
        }),
      ]),
    );
  });

  it("exposes heading nodes and ranges but section spacing still needs adjacency checks", () => {
    expect(summarize("== A ==\nText")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "heading",
          className: "HeadingToken",
          index: 0,
          text: "== A ==",
        }),
      ]),
    );
    expect(summarize("{{T}}\n== A ==\n* item")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "heading",
          className: "HeadingToken",
          index: 6,
          text: "== A ==",
        }),
      ]),
    );
    expect(summarize("=== B ===")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "heading",
          className: "HeadingToken",
          index: 0,
          text: "=== B ===",
        }),
      ]),
    );
    expect(summarize("= not a section =")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "heading",
          className: "HeadingToken",
          index: 0,
          text: "= not a section =",
        }),
      ]),
    );
    expect(summarize("== malformed")).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "heading" })]),
    );
  });

  it("exposes external-link nodes for future investigation", () => {
    expect(summarize("[https://example.com  Label]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext-link",
          className: "ExtLinkToken",
          index: 0,
          text: "[https://example.com  Label]",
        }),
      ]),
    );
    expect(summarize("Text [https://example.com  Label]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext-link",
          index: 5,
          text: "[https://example.com  Label]",
        }),
      ]),
    );
    expect(summarize("[https://example.com]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext-link",
          index: 0,
          text: "[https://example.com]",
        }),
      ]),
    );
    expect(summarize("[mailto:test@example.com  Mail]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext-link",
          className: "ExtLinkToken",
          index: 0,
          text: "[mailto:test@example.com  Mail]",
        }),
      ]),
    );
    expect(summarize("[//example.com  Protocol-relative]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ext-link",
          className: "ExtLinkToken",
          index: 0,
          text: "[//example.com  Protocol-relative]",
        }),
      ]),
    );
    const context = createParserContext(
      "[https://example.com  Label]\n",
      config,
    );
    const [externalLink] = collectNodes(context, "ext-link");
    expect(externalLink).toBeTruthy();
    expect(isNodeWholeLine(context, externalLink!)).toBe(true);
  });

  it("exposes redirect nodes only for redirect-position syntax", () => {
    expect(summarize("#REDIRECT [[Target]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "redirect",
          className: "RedirectToken",
          index: 0,
          text: "#REDIRECT [[Target]]",
        }),
        expect.objectContaining({
          type: "redirect-target",
          className: "RedirectTargetToken",
          text: "[[Target]]",
        }),
      ]),
    );
    expect(summarize("#redirect [[Target]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "redirect",
          className: "RedirectToken",
          index: 0,
          text: "#redirect [[Target]]",
        }),
      ]),
    );
    expect(summarize("#重定向 [[Target]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "redirect",
          className: "RedirectToken",
          index: 0,
          text: "#重定向 [[Target]]",
        }),
      ]),
    );
    expect(summarize("Text\n#REDIRECT [[Target]]")).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "redirect" })]),
    );
    expect(summarize("{{T|x=#REDIRECT [[Target]]}}")).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "redirect" })]),
    );
    expect(summarize("#REDIRECT [[Target|label]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "redirect",
          text: "#REDIRECT [[Target|label]]",
        }),
      ]),
    );
    expect(summarize("#REDIRECT [[Target#Section]]")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "redirect",
          text: "#REDIRECT [[Target#Section]]",
        }),
      ]),
    );
    const context = createParserContext("#REDIRECT [[Target]]\n", config);
    const [redirect] = collectNodes(context, "redirect");
    expect(redirect).toBeTruthy();
    expect(isNodeWholeLine(context, redirect!)).toBe(true);
  });
});

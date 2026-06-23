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
  });
});

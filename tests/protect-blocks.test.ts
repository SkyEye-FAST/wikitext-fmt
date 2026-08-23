import { describe, expect, it } from "vitest";

import { collectProtectedRanges } from "../src/utils/protectBlocks.js";

const rangeOptions = {
  protectComments: false,
  protectIgnoreRanges: false,
  protectTables: false,
};

describe("protected block ranges", () => {
  it.each([
    '<ref name="used" />',
    '<ref name="used"/>',
    '<REF NAME="used"   />',
    '<ref name="a"/><ref name="b" />',
  ])("does not pair a self-closing tag with a later closing tag: %s", (prefix) => {
    const paired = "<ref>body</ref>";
    const source = `${prefix}\nordinary\n${paired}\n`;
    const start = source.indexOf(paired);

    expect(collectProtectedRanges(source, rangeOptions)).toEqual([
      { start, end: start + paired.length },
    ]);
  });

  it.each([
    '<ref name="used">body</ref>',
    '<ref name="a/b">body</ref>',
    '<ref url="https://example.test/x">body</ref>',
  ])("continues to protect a paired tag as one exact range: %s", (paired) => {
    const source = `before\n${paired}\nafter\n`;
    const start = source.indexOf(paired);

    expect(collectProtectedRanges(source, rangeOptions)).toEqual([
      { start, end: start + paired.length },
    ]);
  });
});

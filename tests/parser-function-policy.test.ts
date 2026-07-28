import { describe, expect, it } from "vitest";

import {
  classifyParserFunction,
  formatWikitextSafeDetailed,
} from "../src/index.js";

describe("parser-function formatting policy", () => {
  it.each(["#if", "#ifeq", "#switch", "#expr", "#tag", "#invoke"])(
    "classifies %s as opaque-preserve",
    (name) => {
      expect(classifyParserFunction(name).classification).toBe(
        "opaque-preserve",
      );
    },
  );

  it("classifies an unproven parser function as unsupported and ambiguous", () => {
    expect(classifyParserFunction("#site-specific").classification).toBe(
      "unsupported-ambiguous",
    );
  });

  it.each([
    "{{#if: x | yes | no }}\n",
    "{{#ifeq: a | b | yes | no }}\n",
    "{{#switch: key | value = intentional | default }}\n",
    "{{#expr: 1 + 2 }}\n",
    "{{#tag:nowiki| value with spaces |class= kept }}\n",
    "{{#site-specific: x | y }}\n",
  ])("keeps production bytes unchanged for %s", (input) => {
    const result = formatWikitextSafeDetailed(input, {
      profile: "production",
    });
    expect(result.warning).toBeUndefined();
    expect(result.formatted).toBe(input);
  });
});

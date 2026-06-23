import { describe, expect, it } from "vitest";
import { getParserConfig } from "../src/parser.js";
import { createParserContext } from "../src/parserContext.js";
import { formatTemplates } from "../src/rules/templates.js";

const config = getParserConfig("mediawiki");

describe("simple template formatting parser context", () => {
  it("produces the same output with an explicit parser context", () => {
    const source = "{{Foo|a=1|b=2}}\n";
    expect(
      formatTemplates(source, config, 120, createParserContext(source, config)),
    ).toBe(formatTemplates(source, config, 120));
  });

  it("ignores a stale parser context for a different source", () => {
    expect(
      formatTemplates(
        "{{Foo|a=1}}\n",
        config,
        120,
        createParserContext("Plain text\n", config),
      ),
    ).toBe("{{Foo\n| a = 1\n}}\n");
  });
});

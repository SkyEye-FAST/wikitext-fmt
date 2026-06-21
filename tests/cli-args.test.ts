import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";

describe("CLI argument parsing", () => {
  it("parses schema-driven formatter boolean flags", () => {
    const options = parseArgs([
      "--format-template-parameters",
      "--no-format-file-links",
      "--format-interlanguage-links",
      "--format-section-spacing",
      "--no-format-tables",
      "page.wiki",
    ]);
    expect(options).toMatchObject({
      formatTemplateParameters: true,
      formatFileLinks: false,
      formatInterlanguageLinks: true,
      formatSectionSpacing: true,
      formatTables: false,
      files: ["page.wiki"],
    });
  });

  it("keeps CLI-only conflict checks explicit", () => {
    expect(() => parseArgs(["--write", "--check", "page.wiki"])).toThrow(
      /--write and --check/u,
    );
  });
});

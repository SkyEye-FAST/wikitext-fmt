import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";

describe("CLI argument parsing", () => {
  it("parses schema-driven formatter boolean flags", () => {
    const options = parseArgs([
      "--format-template-parameters",
      "--no-format-file-links",
      "--format-interlanguage-links",
      "--format-references",
      "--format-external-links",
      "--format-section-spacing",
      "--no-format-tables",
      "page.wiki",
    ]);
    expect(options).toMatchObject({
      formatTemplateParameters: true,
      formatFileLinks: false,
      formatInterlanguageLinks: true,
      formatReferences: true,
      formatExternalLinks: true,
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

  it("parses production formatter profiles", () => {
    expect(parseArgs(["--profile", "production", "page.wiki"])).toMatchObject({
      profile: "production",
      files: ["page.wiki"],
    });
    expect(parseArgs(["--profile", "aggressive", "page.wiki"])).toMatchObject({
      profile: "aggressive",
      files: ["page.wiki"],
    });
    expect(() => parseArgs(["--profile", "unsafe", "page.wiki"])).toThrow(
      /default, production, or aggressive/u,
    );
  });
});

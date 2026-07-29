import { describe, expect, it } from "vitest";

import { help, parseArgs } from "../src/cli/args.js";
import { booleanCliFlags } from "../src/options/schema.js";

describe("CLI argument parsing", () => {
  it("keeps structured help synchronized with schema-driven flags", () => {
    const output = help();
    for (const flag of booleanCliFlags.keys()) expect(output).toContain(flag);
    for (const flag of [
      "--profile",
      "--level",
      "--parser-config",
      "--html-void-tag-style",
      "--table-cell-separator-style",
      "--interlanguage-placement",
      "--interlanguage-prefixes",
      "--behavior-switch-placement",
      "--localization-source",
      "--localized-syntax-style",
    ]) {
      expect(output).toContain(flag);
    }
  });

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
    expect(() =>
      parseArgs(["--safe", "--unsafe", "page.wiki"]),
    ).toThrow(/--safe and --unsafe/u);
    expect(parseArgs(["--unsafe", "page.wiki"])).toMatchObject({
      safe: false,
      unsafe: true,
    });
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

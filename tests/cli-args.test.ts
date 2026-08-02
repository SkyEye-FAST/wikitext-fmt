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
      "--inline-template-spacing",
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
      "--no-format-file-links",
      "--no-format-wikilinks",
      "--format-interlanguage-links",
      "--format-references",
      "--format-external-links",
      "--format-section-spacing",
      "--no-format-tables",
      "page.wiki",
    ]);
    expect(options).toMatchObject({
      formatFileLinks: false,
      formatWikilinks: false,
      formatInterlanguageLinks: true,
      formatReferences: true,
      formatExternalLinks: true,
      formatSectionSpacing: true,
      formatTables: false,
      files: ["page.wiki"],
    });
  });

  it("rejects removed template-parameter flags as unknown options", () => {
    for (const flag of [
      `--${["format", "template", "parameters"].join("-")}`,
      `--no-${["format", "template", "parameters"].join("-")}`,
    ]) {
      expect(() => parseArgs([flag, "page.wiki"])).toThrow(
        `Unknown option: ${flag}`,
      );
      expect(help()).not.toContain(flag);
    }
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
    expect(() =>
      parseArgs(["--profile", "aggressive", "page.wiki"]),
    ).toThrow(/default or production/u);
    expect(() => parseArgs(["--profile", "unsafe", "page.wiki"])).toThrow(
      /default or production/u,
    );
  });

  it("parses inline template spacing", () => {
    expect(
      parseArgs(["--inline-template-spacing", "spaced", "page.wiki"]),
    ).toMatchObject({
      inlineTemplateSpacing: "spaced",
      files: ["page.wiki"],
    });
    expect(() =>
      parseArgs(["--inline-template-spacing", "preserve", "page.wiki"]),
    ).toThrow(/auto, compact, or spaced/u);
  });
});

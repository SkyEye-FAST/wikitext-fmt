import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("release smoke", () => {
  it("imports the package entrypoint from dist", async () => {
    const entry = (await import("../dist/index.js")) as {
      formatWikitext: (source: string) => string;
      loadSiteInfoAliases?: unknown;
    };
    expect(entry.formatWikitext("==Title==\n")).toBe("== Title ==\n");
    expect(entry.loadSiteInfoAliases).toBeTypeOf("function");
  });

  it("ships the built CLI help text helper", async () => {
    const args = (await import("../dist/cli/args.js")) as {
      usage: () => string;
    };
    expect(args.usage()).toContain("Usage: wikitext-fmt");
  });

  it("ships generated localization aliases in dist", async () => {
    await access(resolve("dist/localization/generated/mediawiki-aliases.json"));
    const aliases = (await import(
      "../dist/localization/generated/mediawiki-aliases.json",
      {
        with: { type: "json" },
      }
    )) as {
      default: {
        generatedFromLanguages: string[];
        categoryNamespaces: string[];
        fileNamespaces: string[];
        imageOptionAliases: Record<string, string[]>;
      };
    };
    expect(aliases.default.generatedFromLanguages).toContain("De");
    expect(aliases.default.categoryNamespaces).toContain("Kategorie");
    expect(aliases.default.fileNamespaces).toContain("ファイル");
    expect(aliases.default.imageOptionAliases.img_thumbnail).toContain(
      "サムネイル",
    );
  });
});

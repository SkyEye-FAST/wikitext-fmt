import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverConfig,
  resolveCliConfig,
  validateConfig,
} from "../src/cli/config.js";
import { formatWikitext } from "../src/index.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "wikitext-fmt-config-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("CLI configuration", () => {
  it("discovers a config while walking upward", async () => {
    const root = await temporaryDirectory();
    const nested = join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    const config = join(root, ".wikitextfmtrc");
    await writeFile(config, JSON.stringify({ formatHeadings: false }));
    expect(await discoverConfig(nested)).toBe(config);
  });

  it("applies CLI options over explicit config over discovered config", async () => {
    const root = await temporaryDirectory();
    const nested = join(root, "nested");
    await mkdir(nested);
    await writeFile(
      join(root, ".wikitextfmtrc.json"),
      JSON.stringify({
        formatHeadings: false,
        htmlVoidTagStyle: "preserve",
      }),
    );
    const explicit = join(root, "explicit.json");
    await writeFile(
      explicit,
      JSON.stringify({
        formatHeadings: false,
        htmlVoidTagStyle: "xhtml",
      }),
    );

    const discovered = await resolveCliConfig(
      { formatHeadings: true },
      { cwd: nested },
    );
    expect(discovered.options).toEqual({
      formatHeadings: true,
      htmlVoidTagStyle: "preserve",
    });

    const resolved = await resolveCliConfig(
      { formatHeadings: true },
      { cwd: nested, configPath: explicit },
    );
    expect(resolved.options).toEqual({
      formatHeadings: true,
      htmlVoidTagStyle: "xhtml",
    });
    expect(resolved.path).toBe(resolve(explicit));
  });

  it("supports --no-config semantics", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      join(root, "wikitext-fmt.config.json"),
      JSON.stringify({ formatHeadings: false }),
    );
    expect(
      await resolveCliConfig(
        { formatTemplates: false },
        { cwd: root, noConfig: true },
      ),
    ).toEqual({
      options: { formatTemplates: false },
    });
  });

  it("drives formatting with resolved config values", async () => {
    const root = await temporaryDirectory();
    await writeFile(
      join(root, ".wikitextfmtrc"),
      JSON.stringify({
        formatHeadings: false,
        htmlVoidTagStyle: "preserve",
      }),
    );
    const { options } = await resolveCliConfig({}, { cwd: root });
    expect(formatWikitext("==Title==\n<br />\n", options)).toBe(
      "==Title==\n<br />\n",
    );
  });

  it("rejects unknown and invalid options", () => {
    expect(() => validateConfig({ unknown: true })).toThrow(
      /Unknown configuration option/u,
    );
    expect(() => validateConfig({ level: "unsafe" })).toThrow(
      /must be one of/u,
    );
  });

  it("accepts experimental table configuration", () => {
    expect(
      validateConfig({
        formatTables: true,
        level: "experimental",
        tableCellSeparatorStyle: "auto",
      }),
    ).toEqual({
      formatTables: true,
      level: "experimental",
      tableCellSeparatorStyle: "auto",
    });
  });

  it("accepts list formatting configuration", () => {
    expect(validateConfig({ formatLists: false })).toEqual({
      formatLists: false,
    });
  });

  it("accepts file link formatting configuration", () => {
    expect(
      validateConfig({
        formatFileLinks: false,
        localizationAliases: {
          fileNamespaces: ["MediaX"],
          imageOptionAliases: { img_thumbnail: ["miniX"] },
        },
      }),
    ).toEqual({
      formatFileLinks: false,
      localizationAliases: {
        fileNamespaces: ["MediaX"],
        imageOptionAliases: { img_thumbnail: ["miniX"] },
      },
    });
  });

  it("accepts experimental interlanguage and section spacing configuration", () => {
    expect(
      validateConfig({
        formatInterlanguageLinks: true,
        interlanguagePlacement: "footer",
        interlanguagePrefixes: ["en", "ja", "zh-classical"],
        formatSectionSpacing: true,
      }),
    ).toEqual({
      formatInterlanguageLinks: true,
      interlanguagePlacement: "footer",
      interlanguagePrefixes: ["en", "ja", "zh-classical"],
      formatSectionSpacing: true,
    });
  });

  it("accepts experimental template parameter formatting configuration", () => {
    expect(validateConfig({ formatTemplateParameters: true })).toEqual({
      formatTemplateParameters: true,
    });
  });

  it("accepts experimental reference formatting configuration", () => {
    expect(validateConfig({ formatReferences: true })).toEqual({
      formatReferences: true,
    });
  });

  it("accepts redirect formatting configuration", () => {
    expect(
      validateConfig({
        formatRedirects: false,
        localizationAliases: { redirectMagicWords: ["#GO"] },
      }),
    ).toEqual({
      formatRedirects: false,
      localizationAliases: { redirectMagicWords: ["#GO"] },
    });
  });

  it("accepts behavior switch configuration", () => {
    expect(
      validateConfig({
        formatBehaviorSwitches: true,
        behaviorSwitchPlacement: "footer",
      }),
    ).toEqual({
      formatBehaviorSwitches: true,
      behaviorSwitchPlacement: "footer",
    });
  });

  it("rejects invalid behavior switch placement", () => {
    expect(() => validateConfig({ behaviorSwitchPlacement: "header" })).toThrow(
      /preserve, footer/u,
    );
  });

  it("accepts custom localization aliases", () => {
    expect(
      validateConfig({
        localizationSource: "custom",
        localizedSyntaxStyle: "canonical-english",
        localizationAliases: {
          categoryNamespaces: ["CatX"],
          fileNamespaces: ["FileX"],
          defaultsortMagicWords: ["SORTX:"],
          imageOptionAliases: { img_right: ["rechtsX"] },
          behaviorSwitches: { notoc: ["NOTOCX"] },
        },
      }),
    ).toMatchObject({
      localizationSource: "custom",
      localizedSyntaxStyle: "canonical-english",
    });
  });

  it("rejects unknown custom behavior switch IDs", () => {
    expect(() =>
      validateConfig({
        localizationAliases: { behaviorSwitches: { invented: ["VALUE"] } },
      }),
    ).toThrow(/Unknown behavior switch ID/u);
  });

  it("rejects invalid table separator styles", () => {
    expect(() => validateConfig({ tableCellSeparatorStyle: "inline" })).toThrow(
      /auto, split, preserve/u,
    );
  });
});
